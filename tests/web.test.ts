// The decisions in spec/web.md, checked on the real server over ./fixture and the GitHub repository
// answered in tests/helpers.ts, and on the page's own logic in web/atlas.js.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import cytoscape from 'cytoscape';
import { allowedTools, type ScanView, type SkillView } from '../src/core/facets.ts';
import { startServer } from '../src/serve.ts';
import { applyFilters, facetCounts, fromHash, graphElements, renderMarkdown, toHash } from '../web/atlas.js';
import { CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const { server, url } = await startServer({ open, port: 0 });
after(() => server.close());

const get = (path: string) => fetch(new URL(path, url));
const api = async (repo: string): Promise<{ status: number; body: any }> => {
  const response = await get(`/api/scan?repo=${encodeURIComponent(repo)}`);
  return { status: response.status, body: await response.json() };
};
const fixture: ScanView = (await api(FIXTURE)).body;
const skill = (name: string) => fixture.skills.find((candidate) => candidate.name === name) as SkillView;
const root = pathToFileURL(FIXTURE).href;

test('serve listens on 127.0.0.1 and prints its URL', async (t) => {
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0']);
  t.after(() => child.kill());
  const line = await new Promise<string>((resolve) => child.stdout.once('data', (data) => resolve(String(data))));
  assert.match(line, /^Skill Atlas at http:\/\/127\.0\.0\.1:\d+\/\n$/);
});

test('serve: a bad port → the usage; a port in use → a clear message; exit code 1', async (t) => {
  for (const args of [['--port', 'x'], ['--port', '70000'], ['--port'], ['4173']]) {
    const bad = spawnSync(process.execPath, [CLI, 'serve', ...args], { encoding: 'utf8' });
    assert.equal(bad.status, 1, args.join(' '));
    assert.equal(bad.stderr, 'Usage: skill-atlas serve [--port <port>]\n');
  }
  const busy = createServer().listen(0, '127.0.0.1');
  t.after(() => busy.close());
  await new Promise((resolve) => busy.once('listening', resolve));
  const port = (busy.address() as { port: number }).port;
  const inUse = spawnSync(process.execPath, [CLI, 'serve', '--port', String(port)], { encoding: 'utf8' });
  assert.equal(inUse.status, 1);
  assert.equal(inUse.stderr, `Port ${port} is in use; try --port <another>\n`);
});

test('the page, its scripts and Cytoscape are served; nothing else', async () => {
  const page = await get('/');
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  const html = await page.text();
  assert.match(html, /data-view="list"/);
  assert.match(html, /data-view="graph"/);
  assert.match(html, /id="repo"/);
  for (const path of ['/style.css', '/app.js', '/atlas.js', '/graph.js', '/vendor/cytoscape.mjs']) {
    assert.equal((await get(path)).status, 200, path);
  }
  for (const path of ['/package.json', '/../package.json', '/%2e%2e/package.json', '/web/app.js', '/src/cli.ts']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('/api/scan: the CLI\'s result, sorted by name, with the warnings and ignored files', () => {
  assert.equal(fixture.repository.id, 'fixture');
  assert.deepEqual(
    fixture.skills.map((s: { name: string }) => s.name),
    ['code-review', 'code-style', 'commits', 'release-checklist', 'writing-lint-checks'],
  );
  assert.equal(fixture.ignored.length, 5);
  assert.ok(fixture.warnings.includes('.claude/skills/commits/SKILL.md: description differs in .github/skills/Commits/SKILL.md'));
});

test('/api/scan: each skill\'s front matter, body, files, agents and own warnings', () => {
  const commits = skill('commits');
  assert.equal(commits.description, 'Write commit messages the way this repository does. Use for every commit.');
  assert.deepEqual(commits.roots, ['.claude/skills', '.agents/skills', '.github/skills']);
  assert.deepEqual(commits.agents, ['Claude Code', 'Codex / AGENTS.md', 'GitHub Copilot']);
  assert.deepEqual(commits.files, [
    { path: '.claude/skills/commits/SKILL.md', agent: 'Claude Code', link: `${root}/.claude/skills/commits/SKILL.md` },
    { path: '.agents/skills/commits/SKILL.md', agent: 'Codex / AGENTS.md', link: `${root}/.agents/skills/commits/SKILL.md` },
    { path: '.github/skills/Commits/SKILL.md', agent: 'GitHub Copilot', link: `${root}/.github/skills/Commits/SKILL.md` },
  ]);
  assert.equal(commits.link, `${root}/.claude/skills/commits/SKILL.md`);
  assert.match(commits.body, /^# Commits\n\nStart with the area/);
  assert.deepEqual(commits.warnings, ['.claude/skills/commits/SKILL.md: description differs in .github/skills/Commits/SKILL.md']);

  assert.deepEqual(skill('writing-lint-checks').properties, { 'user-invocable': false, metadata: { owner: 'lint' } });
  assert.deepEqual(skill('writing-lint-checks').agents, ['Custom agent']);
  assert.deepEqual(skill('code-review').warnings, [
    '.claude/skills/reviewer/SKILL.md: name "code-review" differs from its directory "reviewer"; using "code-review"',
  ]);
  assert.match(skill('release-checklist').warnings[0], /malformed front matter/);
  assert.equal(skill('release-checklist').description, '');
});

test('skill type: who can invoke it, and tool-restricted', () => {
  assert.equal(skill('code-style').invocation, 'user only');
  assert.equal(skill('writing-lint-checks').invocation, 'model only');
  assert.equal(skill('commits').invocation, 'model and user');
  assert.deepEqual(skill('code-review').tools, ['Read', 'Grep', 'Bash(git diff:*)']);
  assert.deepEqual(skill('commits').tools, []);
});

test('allowed-tools: a list, or comma-, else space-separated, parentheses kept whole', () => {
  assert.deepEqual(allowedTools(['Read', ' Grep ']), ['Read', 'Grep']);
  assert.deepEqual(allowedTools('Read, Grep,Bash(git add:*)'), ['Read', 'Grep', 'Bash(git add:*)']);
  assert.deepEqual(allowedTools('Read Grep  Bash(git commit -m:*)'), ['Read', 'Grep', 'Bash(git commit -m:*)']);
  assert.deepEqual(allowedTools(undefined), []);
  assert.deepEqual(allowedTools(''), []);
});

test('/api/scan on GitHub: links pin the scanned commit', async () => {
  const { status, body } = await api('github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.equal(body.repository.commit, EXAMPLE_COMMIT);
  assert.equal(body.skills[0].link, `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`);
  assert.deepEqual(body.ignored, [{ path: 'src/test/resources/skills/weather/SKILL.md', reason: 'outside the skill roots' }]);
});

test('/api/scan: no repo, or an unreachable one → 400 with the CLI\'s message', async () => {
  assert.deepEqual(await api(''), { status: 400, body: { error: 'Usage: /api/scan?repo=<GitHub URL | directory>' } });
  const missing = join(FIXTURE, 'no-such-directory');
  assert.deepEqual(await api(missing), { status: 400, body: { error: `Not a GitHub URL or a readable directory: ${missing}` } });
  assert.deepEqual(await api('https://github.com/JetBrains/not-answered'), {
    status: 400,
    body: { error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered' },
  });
});

const names = (skills: { name: string }[]) => skills.map((s) => s.name);
const none = fromHash('').filters;

test('filters: OR within a group, AND across groups, search by every word', () => {
  const { skills } = fixture;
  assert.deepEqual(names(applyFilters(skills, { ...none, agent: ['Claude Code'] })), ['code-review', 'commits']);
  assert.deepEqual(names(applyFilters(skills, { ...none, agent: ['Claude Code', 'Custom agent'] })), ['code-review', 'commits', 'writing-lint-checks']);
  assert.deepEqual(names(applyFilters(skills, { ...none, agent: ['Claude Code'], type: ['tool-restricted'] })), ['code-review']);
  assert.deepEqual(names(applyFilters(skills, { ...none, type: ['user only', 'model only'] })), ['code-style', 'writing-lint-checks']);
  assert.deepEqual(names(applyFilters(skills, { ...none, tool: ['Grep'] })), ['code-review']);
  assert.deepEqual(names(applyFilters(skills, { ...none, property: ['metadata'] })), ['writing-lint-checks']);
  assert.deepEqual(names(applyFilters(skills, { ...none, other: ['shared'] })), ['commits']);
  assert.deepEqual(names(applyFilters(skills, { ...none, other: ['warnings'] })), ['code-review', 'commits', 'release-checklist']);
  assert.deepEqual(names(applyFilters(skills, { ...none, other: ['undescribed'] })), ['release-checklist']);
  assert.deepEqual(names(applyFilters(skills, { ...none, query: 'COMMIT every' })), ['commits']);
  assert.deepEqual(names(applyFilters(skills, { ...none, query: 'lint' })), ['writing-lint-checks']);
});

test('filters: each chip counts what it would show, given the other groups', () => {
  const counts: Record<string, { value: string; count: number }[]> = facetCounts(fixture.skills, { ...none, agent: ['Claude Code'] });
  const count = (key: string, value: string) => counts[key].find((item: { value: string }) => item.value === value)?.count;
  // Its own group is not narrowed by itself.
  assert.equal(count('agent', 'Custom agent'), 1);
  assert.equal(count('agent', 'Claude Code'), 2);
  // Other groups count among the Claude Code skills only.
  assert.equal(count('type', 'model and user'), 2);
  assert.equal(count('type', 'user only'), 0);
  assert.equal(count('other', 'shared'), 1);
});

test('the URL hash keeps the repository, the view and the filters', () => {
  const state = { repo: 'github.com/a/b', view: 'graph', filters: { ...none, query: 'x y', agent: ['Claude Code', 'GitHub Copilot'], type: ['user only'] } };
  assert.deepEqual(fromHash(`#${toHash(state)}`), state);
  assert.deepEqual(fromHash(''), { repo: '', view: 'list', filters: none });
});

test('graph: repository → agents → skills, optionally the shared tools and front matter keys', () => {
  const plain = graphElements(fixture.repository, fixture.skills);
  const ids = (elements: { data: { id: string; source?: string } }[], edges: boolean) =>
    elements.filter((e) => Boolean(e.data.source) === edges).map((e) => e.data.id).sort();
  assert.deepEqual(ids(plain, false), [
    'agent:Claude Code', 'agent:Codex / AGENTS.md', 'agent:Custom agent', 'agent:GitHub Copilot', 'repo',
    ...fixture.skills.map((s: { id: string }) => `skill:${s.id}`),
  ].sort());
  // commits is linked to its three agents.
  assert.equal(plain.filter((e: { data: { target?: string } }) => e.data.target === 'skill:fixture:.claude/skills/commits/SKILL.md').length, 3);

  const rich = graphElements(fixture.repository, fixture.skills, { tools: true, properties: true });
  for (const id of ['tool:Read', 'tool:Grep', 'tool:Bash(git diff:*)', 'property:metadata', 'property:allowed-tools']) {
    assert.ok(rich.some((e: { data: { id: string } }) => e.data.id === id), id);
  }
  // Only the filtered skills.
  const one = graphElements(fixture.repository, applyFilters(fixture.skills, { ...none, agent: ['Custom agent'] }));
  assert.deepEqual(ids(one, false), ['agent:Custom agent', 'repo', 'skill:fixture:agent/skills/writing-lint-checks/SKILL.md']);

  // Cytoscape accepts them and lays them out.
  const cy = cytoscape({ headless: true, elements: rich });
  cy.layout({ name: 'cose', animate: false }).run();
  assert.equal(cy.nodes().length, rich.filter((e: { data: { source?: string } }) => !e.data.source).length);
  assert.ok(cy.nodes().map((node) => node.position('x')).every(Number.isFinite));
});

test('the sheet\'s Markdown: a safe subset, HTML shown as text', () => {
  assert.equal(
    renderMarkdown('# Title\n\nSome `code` and **bold**.\n\n- a\n- b\n\n```\n<b>x</b>\n```'),
    '<h2>Title</h2>\n<p>Some <code>code</code> and <strong>bold</strong>.</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<pre><code>&#60;b&#62;x&#60;/b&#62;</code></pre>',
  );
  assert.equal(renderMarkdown('<img src=x onerror=alert(1)>'), '<p>&#60;img src=x onerror=alert(1)&#62;</p>');
  assert.equal(renderMarkdown('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(renderMarkdown('[docs](https://example.com)'), '<p><a href="https://example.com/" target="_blank" rel="noopener">docs</a></p>');
  // Relative links point next to the skill file, at the scanned commit.
  const base = `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;
  assert.equal(
    renderMarkdown('[guide](../../docs/a b.md)', base),
    '<p>[guide](../../docs/a b.md)</p>',
  );
  assert.equal(
    renderMarkdown('See [guide](../../../docs/guide.md).', base),
    `<p>See <a href="https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/docs/guide.md" target="_blank" rel="noopener">guide</a>.</p>`,
  );
  assert.equal(renderMarkdown('[x](data:text/html,hi)', base), '<p>[x](data:text/html,hi)</p>');
  // Without a base, a relative link stays text.
  assert.equal(renderMarkdown('[guide](docs/guide.md)'), '<p>[guide](docs/guide.md)</p>');
});
