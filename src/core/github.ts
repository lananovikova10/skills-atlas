import { AtlasError, EmptyRepositoryError, RateLimitError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search; without it, through the tree. */
  token?: string;
  /** Cancels every request still running. */
  signal?: AbortSignal;
  /** Each request fails after this many milliseconds; none by default. */
  timeout?: number;
  /** For the tests: how the client waits out a rate limit, and what time it is. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * `…/tree/<commit or branch>` pins what is scanned.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^?#]+?))?\/?$/i.exec(
    input.trim(),
  );
  if (!match) return undefined;
  return match[3] ? { owner: match[1], repo: match[2], ref: match[3] } : { owner: match[1], repo: match[2] };
}

/** `https://github.com/<owner>`, with or without the scheme or a trailing slash: an organization or a user. */
export function parseOwnerUrl(input: string): string | undefined {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim())?.[1];
}

/** Resolves the asked ref, else the default branch, to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = createClient(options);
  const info = await github.json<{ full_name: string; default_branch: string }>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const id = info.full_name;
  const ref = name.ref ?? info.default_branch;
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodePath(ref)}`,
    `Commit or branch not found: ${ref} in https://github.com/${id}`,
  );
  const warnings: string[] = [];
  // Code search sees only the default branch as it is now, so a pinned ref is always listed from its tree.
  const paths = options.token && !name.ref ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings, !name.ref);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/**
 * One repository of an organization scan, at its default branch head. The root tree comes first,
 * without recursion: most repositories have no skill root, and then that is the only request.
 */
export async function openDefaultBranch(github: Client, id: string, branch: string): Promise<Source> {
  const [organization, name] = id.split('/');
  const repository = { id, organization, name, url: `https://github.com/${id}`, commit: '' };
  const head = await github.json<Tree & { sha: string }>(`${API}/repos/${id}/git/trees/${encodePath(branch)}`);
  const present = SKILL_ROOTS.filter((root) => head.tree.some((item) => item.path === root.split('/')[0] && item.type === 'tree'));
  if (present.length === 0) return { repository, paths: [], warnings: [], read: async () => undefined };
  // Links pin a commit: the one at the head now, walked from its own tree.
  const commit = await github.json<{ sha: string; commit: { tree: { sha: string } } }>(
    `${API}/repos/${id}/commits/${encodePath(branch)}`,
  );
  const root = commit.commit.tree.sha === head.sha ? head : await github.json<Tree>(`${API}/repos/${id}/git/trees/${commit.sha}`);
  const paths: string[] = [];
  for (const path of SKILL_ROOTS) {
    const sha = await subtree(github, id, root, path);
    if (!sha) continue;
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
    paths.push(...files(tree).map((file) => `${path}/${file}`));
  }
  return {
    repository: { ...repository, commit: commit.sha },
    paths,
    warnings: [],
    read: (path) => github.raw(`${RAW}/${id}/${commit.sha}/${encodePath(path)}`),
  };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], searchable: boolean): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  const hint = searchable ? ' (GITHUB_TOKEN searches everywhere)' : '';
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')}${hint}`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  return subtree(github, id, await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}`), path);
}

/** The same walk, from a tree already at hand. */
async function subtree(github: Client, id: string, start: Tree, path: string): Promise<string | undefined> {
  let tree = start;
  let current: string | undefined;
  for (const segment of path.split('/')) {
    if (current) tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

export type Client = ReturnType<typeof createClient>;

/** A secondary rate limit or a budget that resets sooner than this is waited out; a later one is reported. */
const LONGEST_WAIT = 60_000;
const RETRIES = 3;

/** A GitHub API client: answers are shared by URL, rate limits are waited out when they are short. */
export function createClient({ fetch, token, signal, timeout, sleep = wait, now = Date.now }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init: { headers?: Record<string, string> } = {}): Promise<Response> {
    const signals = [signal, timeout ? AbortSignal.timeout(timeout) : undefined].filter((item) => item !== undefined);
    try {
      return await fetch(url, signals.length ? { ...init, signal: AbortSignal.any(signals) } : init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await get(url, { headers });
      if (response.ok) return response.json();
      const body: unknown = await response.json().catch(() => undefined);
      const message = (body as { message?: unknown } | undefined)?.message;
      const text = typeof message === 'string' ? message : '';
      // An unknown commit or branch is a 422, not a 404.
      if (response.status === 404 || (response.status === 422 && /no commit found/i.test(text))) throw new AtlasError(notFound);
      const limit = rateLimit(response, text, now());
      if (limit) {
        if (limit.wait !== undefined && limit.wait <= LONGEST_WAIT && attempt < RETRIES) {
          await sleep(limit.wait, signal);
          continue;
        }
        throw new RateLimitError(token ? (limit.reset ? 'try again then' : 'try again in a minute') : 'set GITHUB_TOKEN', limit.reset);
      }
      if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
      if (response.status === 409) throw new EmptyRepositoryError('the repository is empty');
      throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
    }
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      // The token lets a private repository's files be read too.
      const response = await get(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/**
 * A 403 or 429 that is a rate limit: how long to wait, from `retry-after` (a secondary limit) or
 * `x-ratelimit-reset` when the budget is spent, and when the budget resets. Undefined if it is not one.
 */
function rateLimit(response: Response, text: string, now: number): { wait?: number; reset?: Date } | undefined {
  if (response.status !== 403 && response.status !== 429) return undefined;
  const retryAfter = Number(response.headers.get('retry-after') ?? NaN);
  const spent = response.headers.get('x-ratelimit-remaining') === '0';
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset') ?? NaN);
  if (!(retryAfter >= 0) && !spent && !/rate limit/i.test(text)) return undefined;
  const reset = Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1000) : undefined;
  if (retryAfter >= 0) return { wait: retryAfter * 1000, reset };
  if (spent && reset) return { wait: Math.max(0, reset.getTime() - now), reset };
  return { reset };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
