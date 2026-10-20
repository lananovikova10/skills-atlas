// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { scanOwner } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';
/** The last commit that changed JetBrains/example's commits skill, and its date. */
export const EXAMPLE_UPDATE = { date: '2026-10-17T09:30:00Z', commit: '3c1b2a4d5e6f708192a3b4c5d6e7f8091a2b3c4d' };

/** What GitHub answers for the last commit up to `sha` that changed `directory`. */
export function lastCommitUrl(repository: string, sha: string, directory: string): string {
  return `https://api.github.com/repos/${repository}/commits?path=${directory}&sha=${sha}&per_page=1`;
}

/** The commits API's answer: the newest commit only, with what the scan reads. */
export function commitAnswer({ date, commit }: { date: string; commit: string }) {
  return { status: 200, body: [{ sha: commit, commit: { committer: { date } } }] };
}

/**
 * What GitHub answers for a small repository, JetBrains/example, with one skill and one
 * test-data SKILL.md. The test data has no raw answer: it must never be read.
 */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 2,
      items: [{ path: '.claude/skills/commits/SKILL.md' }, { path: 'src/test/resources/skills/weather/SKILL.md' }],
    },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
  [lastCommitUrl('JetBrains/example', EXAMPLE_COMMIT, '.claude/skills/commits')]: commitAnswer(EXAMPLE_UPDATE),
};

const github = replay(EXAMPLE);

/** Opens a GitHub URL, answered from EXAMPLE through code search as with a token, or a directory. */
export const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input));

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    scanOwner: (owner, options) => scanOwner(owner, { ...options, fetch: github, token: 'test' }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** The dates of the commits in `datedFixture`: each changes the files after it. */
export const FIXTURE_HISTORY: [date: string, paths: string[]][] = [
  ['2026-01-05T10:00:00+00:00', ['.']],
  // A copy changed later than the canonical file: the skill's date is the copy's.
  ['2026-03-02T08:15:00+00:00', ['.agents/skills/commits/examples.md']],
  ['2026-02-10T16:45:00+01:00', ['.claude/skills/reviewer/checklist.md']],
];

/**
 * A copy of ./fixture named `fixture`, as a git repository of its own with FIXTURE_HISTORY: its dates do
 * not depend on this repository's history, which CI checks out with one commit only. `git: false`: no git.
 */
export function copyFixture(t: { after(fn: () => void): void }, { git = true } = {}): string {
  const parent = mkdtempSync(join(tmpdir(), 'skill-atlas-fixture-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const copy = join(parent, 'fixture');
  cpSync(FIXTURE, copy, { recursive: true });
  if (!git) return copy;
  const inCopy = (args: string[], date?: string) =>
    execFileSync('git', ['-C', copy, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      encoding: 'utf8',
    });
  inCopy(['init', '-q']);
  for (const [date, paths] of FIXTURE_HISTORY) {
    for (const path of paths) if (path !== '.') writeFileSync(join(copy, path), `Changed on ${date}\n`);
    inCopy(['add', '-A']);
    inCopy(['commit', '-q', '-m', `at ${date}`], date);
  }
  return copy;
}

/** The commit of FIXTURE_HISTORY made at `date`, in a copy from `copyFixture`. */
export function fixtureCommit(copy: string, date: string): string {
  return execFileSync('git', ['-C', copy, 'log', '--format=%H %cI'], { encoding: 'utf8' })
    .split('\n')
    .find((line) => line.endsWith(` ${date}`))!
    .split(' ')[0];
}
