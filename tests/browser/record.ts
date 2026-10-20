// Records what GitHub answers for the demo's repository, JetBrains/intellij-community, into
// intellij-community.json: the browser tests replay it, so every run sees the same skills at the
// same commit. Needs the network and GITHUB_TOKEN; run it again only to move the pin, then update
// the counts the tests expect.
//   GITHUB_TOKEN=$(gh auth token) node tests/browser/record.ts
import { writeFileSync } from 'node:fs';
import { openGitHub } from '../../src/core/github.ts';
import type { Fetch } from '../../src/core/github.ts';
import type { Recording } from '../../src/core/replay.ts';
import { scan } from '../../src/core/scan.ts';
import { DEMO_REPOSITORY, RECORDING } from './recording.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Set GITHUB_TOKEN: the tests replay a scan through code search, as with a token');
  process.exit(1);
}

/** Only the fields the scan reads: GitHub's answers carry far more, and a smaller file diffs better. */
function keep(url: string, body: any): unknown {
  if (url.includes('/search/code?')) return { total_count: body.total_count, items: body.items.map(({ path }: { path: string }) => ({ path })) };
  if (url.includes('/commits/')) return { sha: body.sha };
  if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return { full_name: body.full_name, default_branch: body.default_branch };
  return body;
}

const recording: Recording = {};
const recorder: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.clone().text();
  const json = response.headers.get('content-type')?.includes('json');
  recording[url] = { status: response.status, body: json && text && response.ok ? keep(url, JSON.parse(text)) : text };
  return response;
};

const result = await scan(await openGitHub(DEMO_REPOSITORY, { fetch: recorder, token }));
const sorted = Object.fromEntries(Object.entries(recording).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(RECORDING, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${result.repository.id} at ${result.repository.commit}: ${result.skills.length} skills, ${Object.keys(sorted).length} answers`);
