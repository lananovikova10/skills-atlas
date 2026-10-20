// An organization or user scan: every repository of an owner, each scanned as a single repository
// is, at its default branch head, into one combined list. No Node APIs here.
import { AtlasError, EmptyRepositoryError, RateLimitError } from './errors.ts';
import type { Ignored } from './find.ts';
import { createClient, openDefaultBranch, type Client, type GitHubOptions } from './github.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { scan, type ScanResult } from './scan.ts';

const API = 'https://api.github.com';

/** At most this many repositories are scanned; the rest are counted, with a warning. */
export const REPOSITORY_CAP = 500;
/** Repositories scanned at the same time. */
export const CONCURRENCY = 8;
/** One slow request fails its repository, not the scan. */
const TIMEOUT = 30_000;

export const UNAUTHENTICATED_NOTICE =
  'notice: without GITHUB_TOKEN GitHub allows 60 requests an hour, so the results may be incomplete; set GITHUB_TOKEN';

export type Owner = { login: string; type: 'Organization' | 'User'; url: string };

export type OwnerScanOptions = {
  includeArchived?: boolean;
  includeForks?: boolean;
  /** Stops the scan; the repositories scanned so far are kept. */
  signal?: AbortSignal;
  /** Before anything is asked: why the results may be incomplete. */
  onNotice?(text: string): void;
  /** After the listing, and after each repository. */
  onProgress?(progress: { done: number; total: number }): void;
  /** Each repository's skills, as soon as it is scanned. */
  onRepository?(result: ScanResult): void;
  /** For the tests. */
  cap?: number;
  concurrency?: number;
};

export type OwnerScanResult = {
  owner: Owner;
  /** Every repository scanned, with or without skills, by name. */
  repositories: Repository[];
  /** Sorted by name, then repository. Deduplicated within each repository only. */
  skills: Skill[];
  /** `<owner>/<repo>:<path>: …` for a skill file, `<owner>/<repo>: …` for a failed repository. */
  warnings: string[];
  /** Paths as `<owner>/<repo>:<path>`. */
  ignored: Ignored[];
  /** Repository ids, by why they were not scanned. */
  skipped: { archived: string[]; forks: string[]; empty: string[]; overCap: string[] };
  cancelled: boolean;
};

type Listed = { full_name: string; default_branch: string; archived: boolean; fork: boolean };

/** Lists the owner's repositories, all pages, then scans them with a bounded pool. */
export async function scanOwner(login: string, options: GitHubOptions & OwnerScanOptions): Promise<OwnerScanResult> {
  const { signal, cap = REPOSITORY_CAP, concurrency = CONCURRENCY } = options;
  if (!options.token) options.onNotice?.(UNAUTHENTICATED_NOTICE);
  const github = createClient({ timeout: TIMEOUT, ...options });
  const user = await github.json<{ login: string; type: string }>(`${API}/users/${login}`, `Owner not found: https://github.com/${login}`);
  const owner: Owner = { login: user.login, type: user.type === 'Organization' ? 'Organization' : 'User', url: `https://github.com/${user.login}` };

  const skipped: OwnerScanResult['skipped'] = { archived: [], forks: [], empty: [], overCap: [] };
  const eligible: Listed[] = [];
  let listed: Listed[] = [];
  try {
    listed = await listRepositories(github, owner);
  } catch (error) {
    if (!signal?.aborted) throw error;
  }
  for (const repository of listed) {
    if (repository.archived && !options.includeArchived) skipped.archived.push(repository.full_name);
    else if (repository.fork && !options.includeForks) skipped.forks.push(repository.full_name);
    else eligible.push(repository);
  }
  const queue = eligible.slice(0, cap);
  skipped.overCap = eligible.slice(cap).map((repository) => repository.full_name);

  const results: ScanResult[] = [];
  const failures = new Map<string, string>();
  let limited: RateLimitError | undefined;
  let next = 0;
  let done = 0;
  options.onProgress?.({ done, total: queue.length });

  async function worker() {
    while (next < queue.length && !signal?.aborted && !limited) {
      const { full_name: id, default_branch: branch } = queue[next++];
      try {
        const result = await scan(await openDefaultBranch(github, id, branch));
        results.push(result);
        options.onRepository?.(result);
      } catch (error) {
        if (!(error instanceof AtlasError)) throw error;
        // Cancelled or out of budget while it ran: counted as not scanned below.
        if (signal?.aborted) continue;
        if (error instanceof RateLimitError) limited ??= error;
        else if (error instanceof EmptyRepositoryError) skipped.empty.push(id);
        else failures.set(id, `${id}: ${error.message}`);
      }
      done++;
      options.onProgress?.({ done, total: queue.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  // In repository order, whichever finished first.
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  results.sort((a, b) => compare(a.repository.id, b.repository.id));
  const warnings: string[] = [];
  const ids = [...results.map((result) => result.repository.id), ...failures.keys()].sort(compare);
  for (const id of ids) {
    const result = results.find((item) => item.repository.id === id);
    if (result) warnings.push(...result.warnings.map((warning) => `${id}:${warning}`));
    else warnings.push(failures.get(id)!);
  }
  const unfinished = queue.length - results.length - failures.size - skipped.empty.length;
  if (skipped.overCap.length > 0) {
    warnings.push(`more than ${cap} repositories: scanned the first ${cap}, skipped ${skipped.overCap.length}`);
  }
  if (signal?.aborted) warnings.push(`cancelled; ${unfinished} of ${queue.length} repositories not scanned`);
  else if (limited) warnings.push(`${limited.message}; ${unfinished} of ${queue.length} repositories not scanned`);
  for (const list of Object.values(skipped)) list.sort(compare);

  return {
    owner,
    repositories: results.map((result) => result.repository),
    skills: sortSkills(results.flatMap((result) => result.skills)),
    warnings,
    ignored: results
      .flatMap((result) => result.ignored.map((item) => ({ path: `${result.repository.id}:${item.path}`, reason: item.reason })))
      .sort((a, b) => compare(a.path, b.path)),
    skipped,
    cancelled: signal?.aborted ?? false,
  };
}

/** Every page, 100 repositories each, until a page is not full. */
async function listRepositories(github: Client, owner: Owner): Promise<Listed[]> {
  const base =
    owner.type === 'Organization'
      ? `${API}/orgs/${owner.login}/repos?type=all&sort=full_name`
      : `${API}/users/${owner.login}/repos?type=owner&sort=full_name`;
  const repositories: Listed[] = [];
  for (let page = 1; ; page++) {
    const items = await github.json<Listed[]>(`${base}&per_page=100&page=${page}`);
    repositories.push(...items);
    if (items.length < 100) return repositories;
  }
}
