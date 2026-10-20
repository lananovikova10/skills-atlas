// The decisions in spec/analysis.md, spec/cli.md and spec/edge-cases.md, checked on what the real
// command prints for ./fixture and for a small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { findSkills } from '../src/core/find.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { atlas, CLI, commitAnswer, copyFixture, EXAMPLE_COMMIT, FIXTURE, lastCommitUrl } from './helpers.ts';

// ./fixture as a git repository of its own, with known dates.
const FIXTURE_COPY = copyFixture({ after });
const fixture = await atlas(['scan', FIXTURE_COPY]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  updated 2026-10-17',
    ].join('\n'),
  );
  // Found by code search, but never read: there is no raw answer for it.
  assert.equal(example.stderr, 'ignored: src/test/resources/skills/weather/SKILL.md: outside the skill roots');
});

test('./fixture: every unique skill, sorted by name, linked to its file, copies after it, then its last update', () => {
  const root = pathToFileURL(FIXTURE_COPY).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 5 skills',
      'code-review — Review a change before it is merged.',
      `  ${root}/.claude/skills/reviewer/SKILL.md`,
      '  updated 2026-02-10',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      '  updated 2026-01-05',
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .agents/skills/commits/SKILL.md, .github/skills/Commits/SKILL.md',
      '  updated 2026-03-02',
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
      '  updated 2026-01-05',
      'writing-lint-checks — Write a lint check with its tests.',
      `  ${root}/agent/skills/writing-lint-checks/SKILL.md`,
      '  updated 2026-01-05',
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /m);
});

const stderr = fixture.stderr.split('\n');
const stdout = fixture.stdout.split('\n');

test('duplicate across roots → listed once, canonical .claude, the others as copies', () => {
  assert.equal(stdout.filter((line) => line.startsWith('commits')).length, 1);
  const at = stdout.indexOf('commits — Write commit messages the way this repository does.');
  assert.equal(stdout[at + 1], `  ${pathToFileURL(FIXTURE_COPY).href}/.claude/skills/commits/SKILL.md`);
  assert.equal(stdout[at + 2], '  also in .agents/skills/commits/SKILL.md, .github/skills/Commits/SKILL.md');
});

test('differing descriptions → a warning on the canonical file', () => {
  assert.ok(stderr.includes('warning: .claude/skills/commits/SKILL.md: description differs in .github/skills/Commits/SKILL.md'));
  // The same description in .agents is no warning.
  assert.ok(!stderr.some((line) => line.includes('description differs') && line.includes('.agents/')));
});

test('agent/skills is a root', () => {
  assert.ok(stdout.includes(`  ${pathToFileURL(FIXTURE_COPY).href}/agent/skills/writing-lint-checks/SKILL.md`));
});

test('product resources, test data, nested, too deep, wrong case → not listed, one ignored: line each', () => {
  assert.deepEqual(
    stderr.filter((line) => line.startsWith('ignored: ')),
    [
      'ignored: .claude/skills/group/inner/SKILL.md: nested too deep in .claude/skills',
      'ignored: .claude/skills/lowercase/skill.md: not named SKILL.md',
      'ignored: integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md: outside the skill roots',
      'ignored: plugins/mcp-tools/resources/skills/mps-aspect-generator/SKILL.md: outside the skill roots',
      'ignored: plugins/x/.claude/skills/nested/SKILL.md: outside the skill roots',
    ],
  );
  for (const name of ['mps-aspect-generator', 'weather-retrieval', 'nested', 'inner', 'lowercase']) {
    assert.ok(!stdout.some((line) => line.startsWith(name)), name);
  }
  // After the warnings.
  const lastWarning = stderr.findLastIndex((line) => line.startsWith('warning: '));
  assert.ok(lastWarning < stderr.findIndex((line) => line.startsWith('ignored: ')));
});

test('front matter name ≠ directory → a warning, the front matter wins', () => {
  assert.ok(
    stderr.includes('warning: .claude/skills/reviewer/SKILL.md: name "code-review" differs from its directory "reviewer"; using "code-review"'),
  );
  assert.ok(stdout.includes('code-review — Review a change before it is merged.'));
  assert.ok(!stdout.some((line) => line.startsWith('reviewer')));
});

test('findSkills: only <root>/<dir>/SKILL.md at the repository root, in root order', () => {
  const { files, ignored } = findSkills([
    'docs/.claude/skills/x/SKILL.md',
    'SKILL.md',
    '.claude/skills/SKILL.md',
    'agent/skills/b/SKILL.md',
    '.agents/skills/a/SKILL.md',
    '.claude/skills/z/SKILL.md',
    '.claude/skills/z/README.md',
    '.github/skills/a/Skill.md',
  ]);
  assert.deepEqual(files, [
    { path: '.claude/skills/z/SKILL.md', directory: 'z', rootIndex: 0 },
    { path: '.agents/skills/a/SKILL.md', directory: 'a', rootIndex: 1 },
    { path: 'agent/skills/b/SKILL.md', directory: 'b', rootIndex: 3 },
  ]);
  assert.deepEqual(ignored, [
    { path: '.claude/skills/SKILL.md', reason: 'directly in .claude/skills, not in a skill directory' },
    { path: '.github/skills/a/Skill.md', reason: 'not named SKILL.md' },
    { path: 'SKILL.md', reason: 'outside the skill roots' },
    { path: 'docs/.claude/skills/x/SKILL.md', reason: 'outside the skill roots' },
  ]);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE_COPY], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('github.com/<owner>/<repo>/tree/<ref> pins the commit or branch to scan', () => {
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/MPS'), { owner: 'JetBrains', repo: 'MPS' });
  assert.deepEqual(parseGitHubUrl(`https://github.com/JetBrains/MPS/tree/${EXAMPLE_COMMIT}/`), {
    owner: 'JetBrains',
    repo: 'MPS',
    ref: EXAMPLE_COMMIT,
  });
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/koog/tree/feature/x'), { owner: 'JetBrains', repo: 'koog', ref: 'feature/x' });
  assert.equal(parseGitHubUrl('github.com/JetBrains/MPS/blob/master/README.md'), undefined);
});

test('a pinned commit → listed from its tree even with a token, since code search sees only the default branch', async () => {
  const pinned = '6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765';
  // No code search answer: asking for it would fail the scan.
  const github = replay({
    'https://api.github.com/repos/JetBrains/android': { status: 200, body: { full_name: 'JetBrains/android', default_branch: 'master' } },
    [`https://api.github.com/repos/JetBrains/android/commits/${pinned}`]: { status: 200, body: { sha: pinned } },
    [`https://api.github.com/repos/JetBrains/android/git/trees/${pinned}?recursive=1`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: 'agent/skills/writing-lint-checks/SKILL.md', mode: '100644', type: 'blob', sha: 'a' },
          { path: 'agent/skills/writing-lint-checks/more-examples.md', mode: '100644', type: 'blob', sha: 'b' },
        ],
      },
    },
    [`https://raw.githubusercontent.com/JetBrains/android/${pinned}/agent/skills/writing-lint-checks/SKILL.md`]: {
      status: 200,
      body: '---\nname: writing-lint-checks\ndescription: Helps to write a new lint check.\n---\n',
    },
    // The last update is asked up to the pinned commit too.
    [lastCommitUrl('JetBrains/android', pinned, 'agent/skills/writing-lint-checks')]: commitAnswer({ date: '2025-11-03T12:00:00Z', commit: 'c0ffee' }),
  });
  const result = await scan(await openGitHub(`github.com/JetBrains/android/tree/${pinned}`, { fetch: github, token: 'test' }));
  assert.equal(result.repository.commit, pinned);
  assert.deepEqual(result.skills.map((skill) => skill.path), ['agent/skills/writing-lint-checks/SKILL.md']);
  assert.deepEqual(result.skills[0].lastUpdated, { date: '2025-11-03T12:00:00Z', commit: 'c0ffee' });
  assert.deepEqual(result.warnings, []);
});

test('an unknown commit or branch → a clear message, not GitHub\'s 422', async () => {
  const github = replay({
    'https://api.github.com/repos/JetBrains/koog': { status: 200, body: { full_name: 'JetBrains/koog', default_branch: 'develop' } },
    'https://api.github.com/repos/JetBrains/koog/commits/no-such-branch': {
      status: 422,
      body: { message: 'No commit found for SHA: no-such-branch' },
    },
  });
  await assert.rejects(openGitHub('github.com/JetBrains/koog/tree/no-such-branch', { fetch: github }), {
    message: 'Commit or branch not found: no-such-branch in https://github.com/JetBrains/koog',
  });
});
