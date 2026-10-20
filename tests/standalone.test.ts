// The standalone page in spec/web.md: the built file, and its in-page /api/scan over a recorded GitHub.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildStandalone } from '../scripts/build-standalone.ts';
import { replay } from '../src/core/replay.ts';
import { standaloneFetch } from '../src/standalone.ts';
import { EXAMPLE_COMMIT } from './helpers.ts';

const out = await mkdtemp(join(tmpdir(), 'skill-atlas-standalone-'));
after(() => rm(out, { recursive: true, force: true }));
const file = await buildStandalone(out);
const html = await readFile(file, 'utf8');

// JetBrains/example without a token: its files come from the tree, not code search.
const github = replay({
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [`https://api.github.com/repos/JetBrains/example/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
    status: 200,
    body: { truncated: false, tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'a' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does.\n---\n# Commits\n',
  },
  'https://api.github.com/repos/JetBrains/missing': { status: 404, body: { message: 'Not Found' } },
  'https://example.com/other': { status: 200, body: 'passed through' },
});
const page = standaloneFetch(github);
const api = async (repo?: string): Promise<{ status: number; body: any }> => {
  const response = await page(repo === undefined ? '/api/scan' : `/api/scan?repo=${encodeURIComponent(repo)}`);
  return { status: response.status, body: await response.json() };
};

test('standalone: skill-atlas-standalone.html and the same index.html', async () => {
  assert.equal(file, join(out, 'skill-atlas-standalone.html'));
  assert.equal(await readFile(join(out, 'index.html'), 'utf8'), html);
  assert.match(html, /data-view="list"/);
  assert.match(html, /data-view="graph"/);
  assert.match(html, /id="repo"/);
});

test('standalone: the styles, the scripts and Cytoscape are inline; no other file is loaded', () => {
  assert.doesNotMatch(html, /<link\b/);
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/);
  assert.equal(html.match(/<script\b/g)?.length, 1);
  assert.equal(html.match(/<\/script>/g)?.length, 1);
  assert.match(html, /<style>[\s\S]*--primary/);
  assert.match(html, /cytoscape/i);
  assert.doesNotMatch(html, /\/vendor\/cytoscape\.mjs|from ?["']\.\/(app|atlas|graph)\.js/);
});

test('standalone /api/scan: a GitHub repository, scanned in the page without a token', async () => {
  const { status, body } = await api('https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'JetBrains/example');
  assert.equal(body.repository.commit, EXAMPLE_COMMIT);
  assert.deepEqual(body.skills.map((skill: { name: string }) => skill.name), ['commits']);
  assert.deepEqual(body.skills[0].agents, ['Claude Code']);
});

test('standalone /api/scan: not GitHub, no repo, or an AtlasError → 400 with a message', async () => {
  assert.deepEqual(await api('./fixture'), { status: 400, body: { error: 'This standalone page scans GitHub repositories only: ./fixture' } });
  assert.deepEqual(await api(), { status: 400, body: { error: 'Usage: /api/scan?repo=<GitHub URL>' } });
  assert.deepEqual(await api(' '), { status: 400, body: { error: 'Usage: /api/scan?repo=<GitHub URL>' } });
  assert.deepEqual(await api('github.com/JetBrains/missing'), {
    status: 400,
    body: { error: 'Repository not found: https://github.com/JetBrains/missing' },
  });
});

test('standalone: any other request goes to the real fetch', async () => {
  assert.equal(await (await page('https://example.com/other')).text(), 'passed through');
});
