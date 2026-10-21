// When each skill was last updated, spec/analysis.md and spec/cli.md: on a recorded GitHub, on a local
// git repository with known dates (tests/helpers.ts), and on a directory without git.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { run } from '../src/commands.ts';
import { openGitHub, type Fetch } from '../src/core/github.ts';
import { formatDay, newest } from '../src/core/model.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { startServer } from '../src/serve.ts';
import { atlas, commitAnswer, copyFixture, EXAMPLE_COMMIT, EXAMPLE_UPDATE, fixtureCommit, lastCommitUrl, open } from './helpers.ts';

const API = 'https://api.github.com/repos/JetBrains/tools';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const RAW = `https://raw.githubusercontent.com/JetBrains/tools/${COMMIT}`;
const skillFile = (name: string) => `---\nname: ${name}\ndescription: ${name}.\n---\n`;
const OLD = { date: '2026-03-01T10:00:00Z', commit: '1111111' };
const NEW = { date: '2026-09-30T18:20:00Z', commit: '2222222' };

/**
 * JetBrains/tools at COMMIT: `review` in .claude and .agents, `deploy` in .claude only, `docs` in
 * .github only. Each location's last commit is answered by `dates`, by directory.
 */
function tools(dates: Record<string, Recording[string]>): Recording {
  const files = ['.claude/skills/review', '.agents/skills/review', '.claude/skills/deploy', '.github/skills/docs'];
  return {
    [API]: { status: 200, body: { full_name: 'JetBrains/tools', default_branch: 'main' } },
    [`${API}/commits/main`]: { status: 200, body: { sha: COMMIT } },
    [`${API}/git/trees/${COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: files.map((dir) => ({ path: `${dir}/SKILL.md`, mode: '100644', type: 'blob', sha: dir })) },
    },
    ...Object.fromEntries(files.map((dir) => [`${RAW}/${dir}/SKILL.md`, { status: 200, body: skillFile(dir.split('/').at(-1)!) }])),
    ...Object.fromEntries(Object.entries(dates).map(([dir, answer]) => [lastCommitUrl('JetBrains/tools', COMMIT, dir), answer])),
  };
}

const ALL_KNOWN = {
  '.claude/skills/review': commitAnswer(OLD),
  '.agents/skills/review': commitAnswer(NEW),
  '.claude/skills/deploy': commitAnswer(OLD),
  '.github/skills/docs': commitAnswer(NEW),
};

async function scanned(recording: Recording, fetch: Fetch = replay(recording)) {
  return scan(await openGitHub('github.com/JetBrains/tools', { fetch }));
}

test('GitHub: the date of the latest commit up to the scanned commit that changed the skill directory', async () => {
  const requests: string[] = [];
  const answers = replay(tools(ALL_KNOWN));
  const result = await scanned(tools(ALL_KNOWN), (url, init) => (requests.push(url), answers(url, init)));
  const deploy = result.skills.find((skill) => skill.name === 'deploy')!;
  assert.deepEqual(deploy.lastUpdated, OLD);
  // One request per location, pinned to the scanned commit, the newest commit only.
  assert.deepEqual(requests.filter((url) => url.startsWith(`${API}/commits?`)).sort(), [
    `${API}/commits?path=.agents/skills/review&sha=${COMMIT}&per_page=1`,
    `${API}/commits?path=.claude/skills/deploy&sha=${COMMIT}&per_page=1`,
    `${API}/commits?path=.claude/skills/review&sha=${COMMIT}&per_page=1`,
    `${API}/commits?path=.github/skills/docs&sha=${COMMIT}&per_page=1`,
  ]);
  assert.deepEqual(result.warnings, []);
});

test('GitHub: the lookups run at the same time, not one after another', async () => {
  const answers = replay(tools(ALL_KNOWN));
  let waiting = 0;
  let most = 0;
  const release: (() => void)[] = [];
  const fetch: Fetch = async (url, init) => {
    if (!url.startsWith(`${API}/commits?`)) return answers(url, init);
    most = Math.max(most, ++waiting);
    // Every lookup is held until all four are asked: one after another, the scan would never end.
    if (waiting === 4) release.splice(0).forEach((go) => go());
    else await new Promise<void>((resolve) => release.push(resolve));
    return answers(url, init);
  };
  await scanned(tools(ALL_KNOWN), fetch);
  assert.equal(most, 4);
});

test('a deduplicated skill: the latest date across all its locations', async () => {
  const result = await scanned(tools(ALL_KNOWN));
  const review = result.skills.find((skill) => skill.name === 'review')!;
  assert.deepEqual(review.copies, ['.agents/skills/review/SKILL.md']);
  // The copy in .agents changed after the canonical file in .claude.
  assert.deepEqual(review.lastUpdated, NEW);
});

test('newest: by time, not by text; time zones count', () => {
  const utc = { date: '2026-02-10T16:00:00Z', commit: 'a' };
  const paris = { date: '2026-02-10T16:45:00+01:00', commit: 'b' }; // 15:45 UTC
  assert.deepEqual(newest([paris, utc]), utc);
  assert.deepEqual(newest([undefined, paris, null]), paris);
  assert.equal(newest([]), null);
  assert.equal(formatDay(paris), '2026-02-10');
  assert.equal(formatDay({ date: '2026-02-10T23:30:00-02:00', commit: 'c' }), '2026-02-11');
  assert.equal(formatDay(null), '—');
});

test('a lookup that fails → a warning; the other locations still count; the scan goes on', async () => {
  const result = await scanned(
    tools({ ...ALL_KNOWN, '.agents/skills/review': { status: 500, body: { message: 'Server Error' } } }),
  );
  const review = result.skills.find((skill) => skill.name === 'review')!;
  assert.deepEqual(review.lastUpdated, OLD);
  const warning = `.agents/skills/review/SKILL.md: last updated unknown: GitHub answered 500 for ${API}/commits?path=.agents/skills/review&sha=${COMMIT}&per_page=1: Server Error`;
  assert.deepEqual(review.warnings, [warning]);
  assert.deepEqual(result.warnings, [warning]);
});

test('every lookup fails, or no commit is found → date unknown, null, a warning each, the scan not failed', async () => {
  const limited = { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' } };
  const recording = tools({
    '.claude/skills/review': limited,
    '.agents/skills/review': { status: 200, body: [] },
    '.claude/skills/deploy': commitAnswer(OLD),
    // .github/skills/docs: not answered at all.
  });
  const result = await scanned(recording);
  assert.deepEqual(result.skills.map((skill) => [skill.name, skill.lastUpdated]), [['deploy', OLD], ['docs', null], ['review', null]]);
  assert.deepEqual(result.warnings, [
    '.claude/skills/review/SKILL.md: last updated unknown: GitHub rate limit reached (resets at 03:33:20 UTC); set GITHUB_TOKEN',
    '.agents/skills/review/SKILL.md: last updated unknown: no commit changed its directory',
    `.github/skills/docs/SKILL.md: last updated unknown: Cannot reach GitHub: not recorded: ${API}/commits?path=.github/skills/docs&sha=${COMMIT}&per_page=1`,
  ]);
});

test('CLI: `updated YYYY-MM-DD` after each skill, `—` when unknown; the order stays by name', async () => {
  const example = await atlas(['scan', 'github.com/JetBrains/example']);
  assert.equal(example.code, 0);
  assert.equal(example.stdout.split('\n').at(-1), '  updated 2026-10-17');

  const recording = tools({ ...ALL_KNOWN, '.github/skills/docs': { status: 500, body: {} } });
  const github = replay(recording);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', 'github.com/JetBrains/tools'], {
    open: (input) => openGitHub(input, { fetch: github }),
    scanOwner: () => Promise.reject(new Error('not an owner')),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  assert.equal(code, 0);
  assert.deepEqual(stdout, [
    'JetBrains/tools · 3 skills',
    'deploy — deploy.',
    `  https://github.com/JetBrains/tools/blob/${COMMIT}/.claude/skills/deploy/SKILL.md`,
    '  updated 2026-03-01',
    'docs — docs.',
    `  https://github.com/JetBrains/tools/blob/${COMMIT}/.github/skills/docs/SKILL.md`,
    '  updated —',
    'review — review.',
    `  https://github.com/JetBrains/tools/blob/${COMMIT}/.claude/skills/review/SKILL.md`,
    '  also in .agents/skills/review/SKILL.md',
    '  updated 2026-09-30',
  ]);
  assert.deepEqual(stderr, [
    `warning: .github/skills/docs/SKILL.md: last updated unknown: GitHub answered 500 for ${API}/commits?path=.github/skills/docs&sha=${COMMIT}&per_page=1`,
  ]);
});

test('local git directory: `git log -1` up to HEAD, the latest across locations, with its commit', async (t) => {
  const copy = copyFixture(t);
  const result = await scan(await open(copy));
  // git prints the same time as `+00:00` or `Z`, by version: the times are compared, not the text.
  const dates = Object.fromEntries(
    result.skills.map((skill) => [skill.name, skill.lastUpdated && { time: Date.parse(skill.lastUpdated.date), commit: skill.lastUpdated.commit }]),
  );
  const at = (date: string) => ({ time: Date.parse(date), commit: fixtureCommit(copy, date) });
  const first = '2026-01-05T10:00:00+00:00';
  assert.deepEqual(dates, {
    'code-review': at('2026-02-10T16:45:00+01:00'),
    'code-style': at(first),
    // .agents/skills/commits changed last: a copy, not the canonical file.
    commits: at('2026-03-02T08:15:00+00:00'),
    'release-checklist': at(first),
    'writing-lint-checks': at(first),
  });
  // The committer's own offset is kept.
  assert.match(result.skills.find((skill) => skill.name === 'code-review')!.lastUpdated!.date, /\+01:00$/);
  assert.ok(!result.warnings.some((warning) => warning.includes('last updated')));
});

test('local directory without git → `updated —`, a warning for each file, the scan not failed', async (t) => {
  const copy = copyFixture(t, { git: false });
  const { code, stdout, stderr } = await atlas(['scan', copy]);
  assert.equal(code, 0);
  const updated = stdout.split('\n').filter((line) => line.startsWith('  updated '));
  assert.deepEqual(updated, Array(5).fill('  updated —'));
  assert.deepEqual(
    stderr.split('\n').filter((line) => line.includes('last updated')),
    [
      '.claude/skills/commits/SKILL.md',
      '.claude/skills/reviewer/SKILL.md',
      '.agents/skills/commits/SKILL.md',
      '.agents/skills/release-checklist/SKILL.md',
      '.github/skills/Commits/SKILL.md',
      '.github/skills/code-style/SKILL.md',
      'agent/skills/writing-lint-checks/SKILL.md',
    ].map((path) => `warning: ${path}: last updated unknown: not a git repository`),
  );
});

test('/api/scan: `lastUpdated` is `{ date, commit }`, or null when unknown', async (t) => {
  const copy = copyFixture(t, { git: false });
  const { server, url } = await startServer({ open, port: 0 });
  after(() => server.close());
  const api = async (repo: string) => (await fetch(new URL(`/api/scan?repo=${encodeURIComponent(repo)}`, url))).json();
  const example = await api('github.com/JetBrains/example');
  assert.equal(example.repository.commit, EXAMPLE_COMMIT);
  assert.deepEqual(example.skills[0].lastUpdated, EXAMPLE_UPDATE);
  const local = await api(copy);
  assert.ok(local.skills.every((skill: { lastUpdated: unknown }) => skill.lastUpdated === null));
});
