// End to end: the real ./skill-atlas on real GitHub repositories, each pinned to a commit so the
// answer never changes. Needs the network and, in practice, GITHUB_TOKEN: without one GitHub
// allows 60 requests an hour per address, and a run asks for about 140: one for each skill file's last update.
// The expected output is in tests/e2e/expected; after changing a pin, record it again with
//   ./skill-atlas scan github.com/JetBrains/<repo>/tree/<commit> > expected/<repo>.stdout 2> expected/<repo>.stderr
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ATLAS = fileURLToPath(new URL('../../skill-atlas', import.meta.url));
const EXPECTED = new URL('expected/', import.meta.url);

/** The pins: each commit shows the cases in spec/edge-cases.md. */
const MPS = 'd7e4f5c1394535b05e90dde6e3e7e8a3f3e174a2';
/** The last commit with agent/skills: 50fda4f removed them. */
const ANDROID = '6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765';
const KOOG = '22e342e033c716f835312dd6cbe83193e1cbcf76';

type Run = { code: number; stdout: string; stderr: string };

/** `./skill-atlas <args>`, as a user runs it. */
function run(args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    execFile(ATLAS, args, { encoding: 'utf8', timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr });
    });
  });
}

/** Once more when GitHub itself fails for a moment; any other failure is the test's to report. */
async function atlas(...args: string[]): Promise<Run> {
  const first = await run(args);
  return /^(Cannot reach GitHub|GitHub answered 5\d\d)/.test(first.stderr) ? run(args) : first;
}

// At the same time: each scan waits on GitHub.
const [mps, android, koog, koogUrl, unknown] = await Promise.all([
  atlas('scan', `github.com/JetBrains/MPS/tree/${MPS}`),
  atlas('scan', `github.com/JetBrains/android/tree/${ANDROID}`),
  atlas('scan', `github.com/JetBrains/koog/tree/${KOOG}`),
  atlas('scan', `https://github.com/JetBrains/koog/tree/${KOOG}/`),
  atlas('scan', 'github.com/JetBrains/koog/tree/0000000000000000000000000000000000000000'),
]);

const expected = (file: string) => readFileSync(new URL(file, EXPECTED), 'utf8');
const lines = (text: string) => text.split('\n').filter(Boolean);

for (const [repo, run] of [['MPS', mps], ['android', android], ['koog', koog]] as const) {
  test(`JetBrains/${repo} at its pinned commit: exactly the recorded atlas`, () => {
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.stdout, expected(`${repo}.stdout`));
    assert.equal(run.stderr, expected(`${repo}.stderr`));
  });
}

test('every link pins the commit in the URL, not the default branch', () => {
  for (const [repo, commit, run] of [['MPS', MPS, mps], ['android', ANDROID, android], ['koog', KOOG, koog]] as const) {
    const links = lines(run.stdout).filter((line) => line.startsWith('  https://'));
    assert.ok(links.length > 0, repo);
    for (const link of links) assert.ok(link.startsWith(`  https://github.com/JetBrains/${repo}/blob/${commit}/`), link);
  }
});

test('MPS: the same skills in .claude and .agents → listed once, canonical .claude, .agents as the copy', () => {
  const stdout = lines(mps.stdout);
  assert.equal(stdout[0], 'JetBrains/MPS · 42 skills');
  const links = stdout.filter((line) => line.startsWith('  https://'));
  const copies = stdout.filter((line) => line.startsWith('  also in '));
  assert.equal(links.length, 42);
  assert.equal(copies.length, 42);
  for (const [index, link] of links.entries()) {
    const directory = /\/\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(link)?.[1];
    assert.ok(directory, link);
    assert.equal(copies[index], `  also in .agents/skills/${directory}/SKILL.md`);
  }
  // The copies agree: no description warning.
  assert.ok(!mps.stderr.includes('description differs'));
});

test('MPS: the product copy of mps-aspect-generator in plugins/ is never a copy of the project skill', () => {
  const stdout = lines(mps.stdout);
  const at = stdout.findIndex((line) => line.startsWith('mps-aspect-generator — '));
  assert.equal(stdout[at + 1], `  https://github.com/JetBrains/MPS/blob/${MPS}/.claude/skills/mps-aspect-generator/SKILL.md`);
  assert.equal(stdout[at + 2], '  also in .agents/skills/mps-aspect-generator/SKILL.md');
  // Not seen at all: the tree is too large, so only the skill roots are listed.
  assert.ok(!stdout.some((line) => /^  (https:|also in ).*plugins\//.test(line)));
  assert.ok(!mps.stderr.includes('plugins/'));
});

test('MPS, android: a tree too large for one answer → only the skill roots, a warning, no token hint at a pinned commit', () => {
  const warning = 'warning: the tree is too large to list at once; looked only in .claude/skills, .agents/skills, .github/skills, agent/skills';
  assert.equal(lines(mps.stderr)[0], warning);
  assert.equal(lines(android.stderr)[0], warning);
});

test('android: agent/skills is a root, and other files in a skill directory are not skills', () => {
  const stdout = lines(android.stdout);
  assert.equal(stdout[0], 'JetBrains/android · 6 skills');
  const links = stdout.filter((line) => line.startsWith('  https://'));
  assert.equal(links.length, 6);
  for (const link of links) assert.match(link, /\/agent\/skills\/[^/]+\/SKILL\.md$/);
  assert.ok(stdout.includes(`  https://github.com/JetBrains/android/blob/${ANDROID}/agent/skills/writing-lint-checks/SKILL.md`));
  // agent/skills/README.md, writing-lint-checks/more-examples.md, jewel-ui/THEMING.md… : not even ignored.
  assert.equal(stdout.length, 1 + 6 * 3);
  assert.ok(!android.stderr.includes('ignored: '));
});

test('android: front matter name ≠ directory → a warning, the front matter wins', () => {
  assert.ok(
    lines(android.stderr).includes(
      'warning: agent/skills/android-studio-evals/SKILL.md: name "write-evals" differs from its directory "android-studio-evals"; using "write-evals"',
    ),
  );
  assert.ok(lines(android.stdout).some((line) => line.startsWith('write-evals — ')));
  assert.ok(!lines(android.stdout).some((line) => line.startsWith('android-studio-evals')));
});

test('koog: test data under integration-tests → not listed, one ignored: line each, sorted by path', () => {
  assert.equal(lines(koog.stdout)[0], 'JetBrains/koog · 2 skills');
  assert.ok(!koog.stdout.includes('weather-retrieval') && !koog.stdout.includes('arithmetic-evaluator'));
  assert.deepEqual(lines(koog.stderr), [
    'ignored: integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md: outside the skill roots',
    'ignored: integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md: outside the skill roots',
  ]);
});

test('the last update: the latest commit up to the pin that changed the skill directory, in any of its roots', () => {
  // android at its pin: 4d9ec3e, 2026-09-21T15:13:26Z, is the last commit in agent/skills/writing-lint-checks.
  const stdout = lines(android.stdout);
  const at = stdout.findIndex((line) => line.startsWith('writing-lint-checks — '));
  assert.equal(stdout[at + 2], '  updated 2026-09-21');
  // Every skill has one, and none is unknown.
  for (const run of [mps, android, koog]) {
    const updated = lines(run.stdout).filter((line) => line.startsWith('  updated '));
    assert.equal(updated.length, Number(/· (\d+) skills?$/.exec(lines(run.stdout)[0])?.[1]));
    for (const line of updated) assert.match(line, /^  updated \d{4}-\d{2}-\d{2}$/);
    assert.ok(!run.stderr.includes('last updated unknown'));
  }
});

test('the same pin with the scheme and a trailing slash → the same atlas', () => {
  assert.equal(koogUrl.code, 0, koogUrl.stderr);
  assert.equal(koogUrl.stdout, koog.stdout);
});

test('an unknown commit → a clear message, exit code 1', () => {
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stdout, '');
  assert.equal(unknown.stderr, 'Commit or branch not found: 0000000000000000000000000000000000000000 in https://github.com/JetBrains/koog\n');
});
