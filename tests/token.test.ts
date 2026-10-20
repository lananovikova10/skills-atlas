// The GitHub token in spec/web.md: the page's own token, sent to `serve` and to the standalone page's
// /api/scan, and from there to GitHub; every request GitHub gets is recorded with its Authorization.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { bearer, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openFromPage, startServer } from '../src/serve.ts';
import { standaloneFetch } from '../src/standalone.ts';
import { EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const SKILL = '---\nname: commits\ndescription: Write commit messages the way this repository does.\n---\n# Commits\n';
const REPO = 'https://api.github.com/repos/JetBrains/example';
const TREE = `${REPO}/git/trees/${EXAMPLE_COMMIT}?recursive=1`;
const SEARCH = 'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1';
const RAW = `https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;
const CONTENTS = `${REPO}/contents/.claude/skills/commits/SKILL.md?ref=${EXAMPLE_COMMIT}`;

/** JetBrains/example: through the tree without a token, code search with one; its file raw or from the API. */
const EXAMPLE: Recording = {
  [REPO]: { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  [`${REPO}/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [TREE]: { status: 200, body: { truncated: false, tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'a' }] } },
  [SEARCH]: { status: 200, body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] } },
  [RAW]: { status: 200, body: SKILL },
  [CONTENTS]: { status: 200, body: SKILL },
};

/** A GitHub that answers from `recording` and keeps every request: its URL, Authorization and Accept. */
function github(recording: Recording = EXAMPLE) {
  const requests: { url: string; authorization?: string; accept?: string }[] = [];
  const answer = replay(recording);
  const fetch: Fetch = (url, init) => {
    requests.push({ url, authorization: init?.headers?.Authorization, accept: init?.headers?.Accept });
    return answer(url, init);
  };
  return { fetch, requests, authorizations: () => [...new Set(requests.map((request) => request.authorization))] };
}

// Spent, and resetting long after a test would wait: the client reports it at once.
const LIMITED = { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' } };
const REJECTED = { status: 401, body: { message: 'Bad credentials' } };

/** `serve` with GITHUB_TOKEN = `envToken`, over `recording`; `/api/scan` as the page asks it. */
async function serve(envToken?: string, recording?: Recording) {
  const gh = github(recording);
  const { server, url } = await startServer({ open: openFromPage({ fetch: gh.fetch, envToken }), port: 0 });
  after(() => server.close());
  const api = async (repo: string, token?: string) => {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(new URL(`/api/scan?repo=${encodeURIComponent(repo)}`, url), { headers });
    return { status: response.status, body: await response.json() };
  };
  return { ...gh, api };
}

/** The standalone page's own /api/scan, over `recording`. */
function standalone(recording?: Recording) {
  const gh = github(recording);
  const page = standaloneFetch(gh.fetch);
  const api = async (repo: string, token?: string) => {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await page(`/api/scan?repo=${encodeURIComponent(repo)}`, { headers });
    return { status: response.status, body: await response.json() };
  };
  return { ...gh, page, api };
}

test('token: Authorization: Bearer <token>, the way the page sends it', () => {
  assert.equal(bearer('Bearer ghp_abc123'), 'ghp_abc123');
  assert.equal(bearer('bearer  ghp_abc123 '), 'ghp_abc123');
  assert.equal(bearer(undefined), undefined);
  assert.equal(bearer(''), undefined);
  assert.equal(bearer('Bearer '), undefined);
  assert.equal(bearer('Basic dXNlcjpwYXNz'), undefined);
});

test('serve: the page\'s token goes to every GitHub request, and code search is used, as in the CLI', async () => {
  const { api, requests, authorizations } = await serve();
  const { status, body } = await api('https://github.com/JetBrains/example', 'ghp_page');
  assert.equal(status, 200);
  assert.deepEqual(body.skills.map((skill: { name: string }) => skill.name), ['commits']);
  assert.deepEqual(authorizations(), ['Bearer ghp_page']);
  assert.ok(requests.some((request) => request.url === SEARCH));
  assert.ok(requests.some((request) => request.url === RAW), 'Node reads the raw file, with the token');
});

test('serve: the page\'s token wins over GITHUB_TOKEN; an empty field → GITHUB_TOKEN', async () => {
  const withEnv = await serve('ghp_env');
  assert.equal((await withEnv.api('https://github.com/JetBrains/example', 'ghp_page')).status, 200);
  assert.deepEqual(withEnv.authorizations(), ['Bearer ghp_page']);
  withEnv.requests.length = 0;
  assert.equal((await withEnv.api('https://github.com/JetBrains/example')).status, 200);
  assert.deepEqual(withEnv.authorizations(), ['Bearer ghp_env']);
});

test('serve: no token at all → no Authorization, the tree, and a rate limit asks for a GitHub token', async () => {
  const none = await serve();
  assert.equal((await none.api('https://github.com/JetBrains/example')).status, 200);
  assert.deepEqual(none.authorizations(), [undefined]);
  assert.ok(none.requests.some((request) => request.url === TREE));
  assert.ok(!none.requests.some((request) => request.url === SEARCH));

  const limited = await serve(undefined, { ...EXAMPLE, [REPO]: LIMITED });
  assert.deepEqual(await limited.api('https://github.com/JetBrains/example'), {
    status: 400,
    body: { error: 'GitHub rate limit reached (resets at 03:33:20 UTC); add a GitHub token' },
  });
});

test('serve: a token GitHub rejects → names the page\'s token, or GITHUB_TOKEN when that was used', async () => {
  const rejected = await serve('ghp_env', { ...EXAMPLE, [REPO]: REJECTED });
  assert.deepEqual(await rejected.api('https://github.com/JetBrains/example', 'ghp_bad'), {
    status: 400,
    body: { error: 'GitHub rejected the GitHub token' },
  });
  assert.deepEqual(await rejected.api('https://github.com/JetBrains/example'), {
    status: 400,
    body: { error: 'GitHub rejected the token in GITHUB_TOKEN' },
  });
});

test('serve: a local directory ignores the token', async () => {
  const { api, requests } = await serve();
  const { status, body } = await api(FIXTURE, 'ghp_page');
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'fixture');
  assert.deepEqual(requests, []);
});

test('serve: a tree too large for one answer → the warning hints at a GitHub token', async () => {
  const { api } = await serve(undefined, {
    ...EXAMPLE,
    [TREE]: { status: 200, body: { truncated: true, tree: [] } },
    [`${REPO}/git/trees/${EXAMPLE_COMMIT}`]: { status: 200, body: { truncated: false, tree: [] } },
  });
  const { status, body } = await api('https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, [
    'the tree is too large to list at once; looked only in .claude/skills, .agents/skills, .github/skills, agent/skills (a GitHub token searches everywhere)',
  ]);
});

test('standalone: the page\'s token goes to the API; listed from the tree, files through the contents API, not raw', async () => {
  const { api, requests, authorizations } = standalone();
  const { status, body } = await api('https://github.com/JetBrains/example', 'ghp_page');
  assert.equal(status, 200);
  assert.deepEqual(body.skills.map((skill: { name: string }) => skill.name), ['commits']);
  assert.equal(body.skills[0].description, 'Write commit messages the way this repository does.');
  assert.deepEqual(authorizations(), ['Bearer ghp_page']);
  // A page cannot read code search's answer to a token: no Access-Control-Allow-Origin.
  assert.ok(requests.some((request) => request.url === TREE));
  assert.ok(!requests.some((request) => request.url.startsWith('https://api.github.com/search/')));
  assert.ok(!requests.some((request) => request.url.startsWith('https://raw.githubusercontent.com/')));
  assert.deepEqual(requests.find((request) => request.url === CONTENTS), {
    url: CONTENTS,
    authorization: 'Bearer ghp_page',
    accept: 'application/vnd.github.raw',
  });
});

test('standalone: a tree too large for one answer, with a token → the warning, without the code search hint', async () => {
  const { api, requests } = standalone({
    ...EXAMPLE,
    [TREE]: { status: 200, body: { truncated: true, tree: [] } },
    [`${REPO}/git/trees/${EXAMPLE_COMMIT}`]: { status: 200, body: { truncated: false, tree: [] } },
  });
  const { status, body } = await api('https://github.com/JetBrains/example', 'ghp_page');
  assert.equal(status, 200);
  assert.deepEqual(body.warnings, [
    'the tree is too large to list at once; looked only in .claude/skills, .agents/skills, .github/skills, agent/skills',
  ]);
  assert.ok(!requests.some((request) => request.url.startsWith('https://api.github.com/search/')));
});

test('standalone: a Request with the header works the same', async () => {
  const { page, authorizations } = standalone();
  const request = new Request(`http://standalone/api/scan?repo=${encodeURIComponent('github.com/JetBrains/example')}`, {
    headers: { Authorization: 'Bearer ghp_page' },
  });
  assert.equal((await page(request)).status, 200);
  assert.deepEqual(authorizations(), ['Bearer ghp_page']);
});

test('standalone: no token → no Authorization, the tree and raw files, as before', async () => {
  const { api, requests, authorizations } = standalone();
  assert.equal((await api('https://github.com/JetBrains/example')).status, 200);
  assert.deepEqual(authorizations(), [undefined]);
  assert.ok(requests.some((request) => request.url === TREE));
  assert.ok(requests.some((request) => request.url === RAW));
  assert.ok(!requests.some((request) => request.url === CONTENTS));
});

test('standalone: the rate limit asks for a GitHub token; a rejected one says so', async () => {
  assert.deepEqual(await standalone({ ...EXAMPLE, [REPO]: LIMITED }).api('https://github.com/JetBrains/example'), {
    status: 400,
    body: { error: 'GitHub rate limit reached (resets at 03:33:20 UTC); add a GitHub token' },
  });
  assert.deepEqual(await standalone({ ...EXAMPLE, [REPO]: REJECTED }).api('https://github.com/JetBrains/example', 'ghp_bad'), {
    status: 400,
    body: { error: 'GitHub rejected the GitHub token' },
  });
  // GitHub can also reject it only when the file is read.
  assert.deepEqual(await standalone({ ...EXAMPLE, [CONTENTS]: REJECTED }).api('https://github.com/JetBrains/example', 'ghp_bad'), {
    status: 400,
    body: { error: 'GitHub rejected the GitHub token' },
  });
});

test('standalone: a private file the token cannot see is a missing file, as on raw', async () => {
  const { api } = standalone({ ...EXAMPLE, [CONTENTS]: { status: 404, body: { message: 'Not Found' } } });
  const { status, body } = await api('https://github.com/JetBrains/example', 'ghp_page');
  assert.equal(status, 200);
  assert.deepEqual(body.skills, []);
  assert.deepEqual(body.warnings, ['.claude/skills/commits/SKILL.md: listed, but not found at the scanned commit; skipped']);
});
