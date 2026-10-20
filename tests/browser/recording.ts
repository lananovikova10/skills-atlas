// The browser tests' data: GitHub's answers for the demo's repository, recorded by record.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openGitHub, parseGitHubUrl } from '../../src/core/github.ts';
import { replay, type Recording } from '../../src/core/replay.ts';
import { openDirectory } from '../../src/local.ts';

/** The repository the demo analyses, as typed: its default branch, pinned by the recording. */
export const DEMO_REPOSITORY = 'https://github.com/JetBrains/intellij-community';

export const RECORDING = fileURLToPath(new URL('intellij-community.json', import.meta.url));

/** Opens a GitHub URL from the recording, through code search as with a token; anything else fails. */
export function openRecorded() {
  const github = replay(JSON.parse(readFileSync(RECORDING, 'utf8')) as Recording);
  return (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input));
}
