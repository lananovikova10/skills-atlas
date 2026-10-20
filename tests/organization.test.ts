// spec/organization.md, checked on what the real command prints for an organization that GitHub
// answers from a recording built below: skills, no skills, archived, a fork, empty, failing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/commands.ts';
import { parseGitHubUrl, parseOwnerUrl, type Fetch } from '../src/core/github.ts';
import { scanOwner, UNAUTHENTICATED_NOTICE, type OwnerScanOptions } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

type Repo = { name: string; archived?: boolean; fork?: boolean; branch?: string };
type Skills = Record<string, string>; // path → SKILL.md content

const skillFile = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n`;
const commitOf = (owner: string, repo: string) => `${owner}-${repo}-commit`.toLowerCase().padEnd(40, '0').slice(0, 40);

/** What GitHub answers for an owner and its repositories, page by page; `skills` per repository. */
function recording(owner: string, type: 'Organization' | 'User', repos: Repo[], skills: Record<string, Skills>): Recording {
  const answers: Recording = { [`${API}/users/${owner}`]: { status: 200, body: { login: owner, type } } };
  const base = type === 'Organization' ? `${API}/orgs/${owner}/repos?type=all&sort=full_name` : `${API}/users/${owner}/repos?type=owner&sort=full_name`;
  for (let page = 1; page === 1 || (page - 1) * 100 <= repos.length; page++) {
    const items = repos.slice((page - 1) * 100, page * 100).map((repo) => ({
      full_name: `${owner}/${repo.name}`,
      default_branch: repo.branch ?? 'main',
      archived: repo.archived ?? false,
      fork: repo.fork ?? false,
    }));
    answers[`${base}&per_page=100&page=${page}`] = { status: 200, body: items };
  }
  for (const repo of repos) Object.assign(answers, repository(owner, repo, skills[repo.name] ?? {}));
  return answers;
}

/** One repository's trees, commit and files: the root tree, and each skill root's when it has skills. */
function repository(owner: string, repo: Repo, skills: Skills): Recording {
  const id = `${owner}/${repo.name}`;
  const commit = commitOf(owner, repo.name);
  const roots = [...new Set(Object.keys(skills).map((path) => path.split('/').slice(0, 2).join('/')))];
  const tops = [...new Set(roots.map((root) => root.split('/')[0]))];
  const answers: Recording = {
    [`${API}/repos/${id}/git/trees/${repo.branch ?? 'main'}`]: {
      status: 200,
      body: {
        sha: `${id}:tree`,
        truncated: false,
        tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: 'r' }, ...tops.map((top) => ({ path: top, mode: '040000', type: 'tree', sha: `${id}:${top}` }))],
      },
    },
  };
  if (roots.length === 0) return answers;
  answers[`${API}/repos/${id}/commits/${repo.branch ?? 'main'}`] = { status: 200, body: { sha: commit, commit: { tree: { sha: `${id}:tree` } } } };
  for (const top of tops) {
    answers[`${API}/repos/${id}/git/trees/${id}:${top}`] = {
      status: 200,
      body: { sha: `${id}:${top}`, truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: `${id}:${top}/skills` }] },
    };
  }
  for (const root of roots) {
    const files = Object.keys(skills).filter((path) => path.startsWith(`${root}/`));
    answers[`${API}/repos/${id}/git/trees/${id}:${root}?recursive=1`] = {
      status: 200,
      body: { truncated: false, tree: files.map((path) => ({ path: path.slice(root.length + 1), mode: '100644', type: 'blob', sha: path })) },
    };
    for (const path of files) answers[`${RAW}/${id}/${commit}/${path}`] = { status: 200, body: skills[path] };
  }
  return answers;
}

/** A fetch that also records which URLs were asked for. */
function recorded(fetch: Fetch) {
  const asked: string[] = [];
  const wrapped: Fetch = (url, init) => (asked.push(url), fetch(url, init));
  return { fetch: wrapped, asked };
}

/** `skill-atlas <args>` with GitHub answering from `fetch`. */
async function atlas(args: string[], fetch: Fetch, options: { token?: string } & Partial<OwnerScanOptions> = { token: 'test' }) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const progress: string[] = [];
  const code = await run(args, {
    open: () => Promise.reject(new Error('not an owner scan')),
    scanOwner: (owner, scanOptions) => scanOwner(owner, { ...options, ...scanOptions, fetch }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
    progress: (text) => progress.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n'), progress };
}

// Acme: 101 repositories, so two pages. tools and zeta (on page 2) have skills; old is archived and
// fork a fork, both with skills; empty has no commit; broken fails; 95 more have none.
const ACME_REPOS: Repo[] = [
  { name: 'broken' },
  { name: 'docs' },
  { name: 'empty' },
  { name: 'fork', fork: true },
  { name: 'old', archived: true },
  { name: 'tools' },
  ...Array.from({ length: 94 }, (_, i) => ({ name: `x-${String(i).padStart(2, '0')}` })),
  { name: 'zeta', branch: 'trunk' },
];
const ACME = recording('Acme', 'Organization', ACME_REPOS, {
  tools: {
    '.claude/skills/commits/SKILL.md': skillFile('commits', 'Write commit messages the Acme way. Always.'),
    '.claude/skills/review/SKILL.md': skillFile('code-review', 'Review a change.'),
    '.agents/skills/commits/SKILL.md': skillFile('commits', 'Write commit messages the Acme way. Always.'),
    '.agents/skills/lower/skill.md': skillFile('lower', 'Not a skill.'),
  },
  zeta: { '.github/skills/commits/SKILL.md': skillFile('commits', 'Commit the zeta way.') },
  old: { '.claude/skills/legacy/SKILL.md': skillFile('legacy', 'An old skill.') },
  fork: { '.claude/skills/forked/SKILL.md': skillFile('forked', 'A forked skill.') },
});
ACME[`${API}/repos/Acme/empty/git/trees/main`] = { status: 409, body: { message: 'Git Repository is empty.' } };
ACME[`${API}/repos/Acme/broken/git/trees/main`] = { status: 500, body: { message: 'Server Error' } };

const acme = recorded(replay(ACME));
const scanned = await atlas(['scan', 'https://github.com/Acme'], acme.fetch);
const TOOLS = commitOf('Acme', 'tools');
const ZETA = commitOf('Acme', 'zeta');

test('an owner URL is an organization or user scan; a repository URL is not', () => {
  for (const input of ['https://github.com/Acme', 'github.com/Acme/', 'http://www.github.com/Acme']) assert.equal(parseOwnerUrl(input), 'Acme', input);
  for (const input of ['github.com/Acme/tools', 'github.com/Acme/tools/', 'github.com/Acme/tools/tree/main', 'github.com', 'Acme']) {
    assert.equal(parseOwnerUrl(input), undefined, input);
  }
  assert.equal(parseGitHubUrl('github.com/Acme/'), undefined);
  assert.deepEqual(parseGitHubUrl('github.com/Acme/tools/'), { owner: 'Acme', repo: 'tools' });
});

test('an organization: one combined list, sorted by name then repository, each linked to its own commit', () => {
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'Acme · 3 skills in 97 repositories · 3 skipped · 2 warnings',
      'code-review · tools — Review a change.',
      `  https://github.com/Acme/tools/blob/${TOOLS}/.claude/skills/review/SKILL.md`,
      'commits · tools — Write commit messages the Acme way.',
      `  https://github.com/Acme/tools/blob/${TOOLS}/.claude/skills/commits/SKILL.md`,
      '  also in .agents/skills/commits/SKILL.md',
      'commits · zeta — Commit the zeta way.',
      `  https://github.com/Acme/zeta/blob/${ZETA}/.github/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('warnings name their repository; a failing repository is a warning, not a failed scan', () => {
  assert.equal(
    scanned.stderr,
    [
      `warning: Acme/broken: GitHub answered 500 for ${API}/repos/Acme/broken/git/trees/main: Server Error`,
      'warning: Acme/tools:.claude/skills/review/SKILL.md: name "code-review" differs from its directory "review"; using "code-review"',
      'ignored: Acme/tools:.agents/skills/lower/skill.md: not named SKILL.md',
      'skipped: 1 archived (--include-archived), 1 fork (--include-forks), 1 empty',
    ].join('\n'),
  );
});

test('every page of repositories is listed; archived and forks are never asked for', () => {
  assert.ok(acme.asked.includes(`${API}/orgs/Acme/repos?type=all&sort=full_name&per_page=100&page=2`));
  assert.ok(!acme.asked.some((url) => url.includes('page=3')));
  assert.ok(!acme.asked.some((url) => url.includes('/Acme/old/') || url.includes('/Acme/fork/')));
  assert.ok(scanned.stdout.includes('· zeta —'), 'the repository on page 2 is scanned');
});

test('a repository without skill roots costs one request: its root tree', () => {
  for (const name of ['docs', 'x-00', 'x-93']) {
    assert.deepEqual(acme.asked.filter((url) => url.includes(`/Acme/${name}/`)), [`${API}/repos/Acme/${name}/git/trees/main`]);
  }
});

test('skill ids include the repository; the same name is deduplicated within a repository only', async () => {
  const result = await scanOwner('Acme', { fetch: replay(ACME), token: 'test' });
  assert.deepEqual(
    result.skills.map((skill) => [skill.id, skill.copies]),
    [
      ['Acme/tools:.claude/skills/review/SKILL.md', []],
      ['Acme/tools:.claude/skills/commits/SKILL.md', ['.agents/skills/commits/SKILL.md']],
      ['Acme/zeta:.github/skills/commits/SKILL.md', []],
    ],
  );
  assert.deepEqual(result.skills.map((skill) => skill.commit), [TOOLS, TOOLS, ZETA]);
  assert.equal(result.owner.type, 'Organization');
  assert.equal(result.repositories.length, 97, 'repositories without skills are counted');
  assert.deepEqual(result.skipped, { archived: ['Acme/old'], forks: ['Acme/fork'], empty: ['Acme/empty'], overCap: [] });
});

test('--include-archived and --include-forks scan them too', async () => {
  const all = await atlas(['scan', 'github.com/Acme', '--include-archived', '--include-forks'], replay(ACME));
  assert.equal(all.code, 0, all.stderr);
  assert.equal(all.stdout.split('\n')[0], 'Acme · 5 skills in 99 repositories · 1 skipped · 2 warnings');
  assert.ok(all.stdout.includes('forked · fork — A forked skill.'));
  assert.ok(all.stdout.includes('legacy · old — An old skill.'));
  assert.match(all.stderr, /^skipped: 1 empty$/m);
});

test('the flags are for an owner URL only', async () => {
  const repo = await atlas(['scan', 'github.com/Acme/tools', '--include-forks'], replay(ACME));
  assert.equal(repo.code, 1);
  assert.equal(repo.stderr, '--include-forks: only for an organization or user URL, https://github.com/<owner>');
});

test('a user account: its repositories through /users/<user>/repos', async () => {
  const jane = recorded(replay(recording('jane', 'User', [{ name: 'dotfiles' }], { dotfiles: { 'agent/skills/setup/SKILL.md': skillFile('setup', 'Set up a machine.') } })));
  const result = await atlas(['scan', 'github.com/jane'], jane.fetch);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'jane · 1 skill in 1 repository · 0 skipped · 0 warnings');
  assert.ok(jane.asked.includes(`${API}/users/jane/repos?type=owner&sort=full_name&per_page=100&page=1`));
  assert.ok(!jane.asked.some((url) => url.includes('/orgs/')));
});

test('owner not found → a clear message, exit code 1', async () => {
  const missing = await atlas(['scan', 'https://github.com/nobody'], replay({ [`${API}/users/nobody`]: { status: 404, body: { message: 'Not Found' } } }));
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr, 'Owner not found: https://github.com/nobody');
  assert.equal(missing.stdout, '');
});

test('progress: Scanning N / K repositories…, from 0 to all', () => {
  assert.equal(scanned.progress[0], 'Scanning 0 / 99 repositories…');
  assert.equal(scanned.progress.at(-1), 'Scanning 99 / 99 repositories…');
  assert.equal(scanned.progress.length, 100);
});

// Three repositories with a skill each: a, b, c.
const ABC = recording('abc', 'Organization', [{ name: 'a' }, { name: 'b' }, { name: 'c' }], {
  a: { '.claude/skills/one/SKILL.md': skillFile('one', 'One.') },
  b: { '.claude/skills/two/SKILL.md': skillFile('two', 'Two.') },
  c: { '.claude/skills/three/SKILL.md': skillFile('three', 'Three.') },
});

test('results stream in as each repository finishes; cancelling keeps them, exit code 130', async () => {
  const cancel = new AbortController();
  const streamed: string[] = [];
  const result = await atlas(['scan', 'github.com/abc'], replay(ABC), {
    token: 'test',
    concurrency: 1,
    signal: cancel.signal,
    onRepository: (repository) => {
      streamed.push(...repository.skills.map((skill) => skill.name));
      cancel.abort();
    },
  });
  assert.deepEqual(streamed, ['one']);
  assert.equal(result.code, 130);
  assert.equal(result.stdout.split('\n')[0], 'abc · 1 skill in 1 repository · 0 skipped · 1 warning');
  assert.equal(result.stderr, 'warning: cancelled; 2 of 3 repositories not scanned');
});

test('rate-limit exhaustion → the reset time, the repositories not scanned, the results so far', async () => {
  const reset = Date.parse('2026-10-20T12:00:00Z') / 1000;
  const limited = replay({
    ...ABC,
    [`${API}/repos/abc/b/git/trees/main`]: {
      status: 403,
      body: { message: 'API rate limit exceeded for user ID 1.' },
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
    },
  });
  const now = () => Date.parse('2026-10-20T11:15:00Z');
  const result = await scanOwner('abc', { fetch: limited, token: 'test', concurrency: 1, now, sleep: () => assert.fail('a reset 45 minutes away is not waited for') });
  assert.deepEqual(result.skills.map((skill) => skill.name), ['one']);
  assert.deepEqual(result.warnings, ['GitHub rate limit reached (resets at 12:00:00 UTC); try again then; 2 of 3 repositories not scanned']);

  // When the listing itself is out of budget, there is nothing to show: exit code 1.
  const listing = await atlas(
    ['scan', 'github.com/abc'],
    replay({
      [`${API}/users/abc`]: { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } },
    }),
    { token: undefined },
  );
  assert.equal(listing.code, 1);
  assert.equal(listing.stderr, [UNAUTHENTICATED_NOTICE, 'GitHub rate limit reached (resets at 12:00:00 UTC); set GITHUB_TOKEN'].join('\n'));
});

test('a short rate limit is waited out: retry-after, or a budget that resets within a minute', async () => {
  const waits: number[] = [];
  const tries = { a: 0, b: 0 };
  const flaky: Fetch = async (url, init) => {
    if (url === `${API}/repos/abc/a/git/trees/main` && tries.a++ === 0) {
      return new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 429, headers: { 'retry-after': '2' } });
    }
    if (url === `${API}/repos/abc/b/git/trees/main` && tries.b++ === 0) {
      return new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1010' } });
    }
    return replay(ABC)(url, init);
  };
  const result = await scanOwner('abc', { fetch: flaky, token: 'test', concurrency: 1, now: () => 1_000_000, sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(waits, [2000, 10_000]);
  assert.deepEqual(result.skills.map((skill) => skill.name).sort(), ['one', 'three', 'two']);
  assert.deepEqual(result.warnings, []);
});

test('a repository that times out is a warning naming it; the scan goes on', async () => {
  const slow: Fetch = (url, init) =>
    url.includes('/abc/b/')
      ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
      : replay(ABC)(url, init);
  const result = await scanOwner('abc', { fetch: slow, token: 'test', timeout: 50 });
  assert.deepEqual(result.skills.map((skill) => skill.name).sort(), ['one', 'three']);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^abc\/b: Cannot reach GitHub: .*timeout/i);
});

test('a skill root GitHub truncates is a warning naming its repository; the scan goes on', async () => {
  const url = `${API}/repos/abc/b/git/trees/abc/b:.claude/skills?recursive=1`;
  const truncated = { ...ABC, [url]: { status: 200, body: { ...(ABC[url].body as object), truncated: true } } };
  const result = await scanOwner('abc', { fetch: replay(truncated), token: 'test' });
  assert.deepEqual(result.skills.map((skill) => skill.name).sort(), ['one', 'three']);
  assert.deepEqual(result.warnings, ['abc/b: cannot completely scan .claude/skills: GitHub truncated the tree']);
});

test('above the cap, the scan stops there with a warning naming how many were skipped', async () => {
  const result = await scanOwner('abc', { fetch: replay(ABC), token: 'test', cap: 2 });
  assert.deepEqual(result.repositories.map((repository) => repository.id), ['abc/a', 'abc/b']);
  assert.deepEqual(result.skipped.overCap, ['abc/c']);
  assert.deepEqual(result.warnings, ['more than 2 repositories: scanned the first 2, skipped 1']);
});

test('without a token: a notice up front that the results may be incomplete', async () => {
  const result = await atlas(['scan', 'github.com/abc'], replay(ABC), { token: undefined });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, UNAUTHENTICATED_NOTICE);
});

test('100 repositories with a skill each: a bounded pool, well under 30 s', async () => {
  const repos = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}` }));
  const answers = replay(recording('big', 'Organization', repos, Object.fromEntries(repos.map((repo) => [repo.name, { '.claude/skills/s/SKILL.md': skillFile(`s-${repo.name}`, 'S.') }]))));
  let running = 0;
  let most = 0;
  const latency: Fetch = async (url, init) => {
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, 10));
    running--;
    return answers(url, init);
  };
  const started = performance.now();
  const result = await scanOwner('big', { fetch: latency, token: 'test' });
  assert.equal(result.skills.length, 100);
  assert.ok(most > 1 && most <= 8, `at most 8 repositories at a time, got ${most}`);
  assert.ok(performance.now() - started < 30_000);
});
