// The live search in spec/web.md, on the page's own logic in web/atlas.js: what matches, how it
// combines with the facets, and that it is fast enough to follow every keystroke.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, facetCounts, fromHash, matchesQuery, toHash } from '../web/atlas.js';

const flags = { name: 'feature-flags', description: 'Use when feature flag tests fail on CI.' };
const none = fromHash('').filters;

test('search: case-insensitive, over the name and the description', () => {
  assert.equal(matchesQuery(flags, 'FEATURE'), true);
  assert.equal(matchesQuery(flags, 'Flags'), true);
  assert.equal(matchesQuery(flags, 'ci'), true);
});

test('search: leading and trailing whitespace is ignored', () => {
  assert.equal(matchesQuery(flags, '  flag  '), true);
  assert.equal(matchesQuery(flags, '\tflag\n'), true);
});

test('search: every word must match, in any order, in either field', () => {
  assert.equal(matchesQuery(flags, 'flag test'), true);
  assert.equal(matchesQuery(flags, 'test   flag'), true);
  // `feature-flags` from the name, `fail` from the description.
  assert.equal(matchesQuery(flags, 'fail feature-flags'), true);
  assert.equal(matchesQuery(flags, 'flag deploy'), false);
});

test('search: a word only in the description matches', () => {
  assert.equal(matchesQuery(flags, 'tests'), true);
  assert.equal(matchesQuery({ name: 'release-checklist', description: '' }, 'tests'), false);
});

test('search: no match', () => {
  assert.equal(matchesQuery(flags, 'deploy'), false);
  // Words are matched within a field: the name's end and the description's start are not one word.
  assert.equal(matchesQuery(flags, 'flagsuse'), false);
});

test('search: an empty query matches everything', () => {
  assert.equal(matchesQuery(flags, ''), true);
  assert.equal(matchesQuery(flags, '   '), true);
  assert.equal(matchesQuery({ name: 'x', description: '' }, ''), true);
});

/** `count` skills, as the API answers them; every tenth is about feature flags. */
function skills(count: number) {
  const agents = ['Claude Code', 'Codex / AGENTS.md', 'GitHub Copilot', 'Custom agent'];
  const invocations = ['model and user', 'user only', 'model only'];
  return Array.from({ length: count }, (_, index) => ({
    id: `repo:.claude/skills/skill-${index}/SKILL.md`,
    name: index % 10 === 0 ? `feature-flags-${index}` : `skill-${index}`,
    description: index % 10 === 0 ? 'Use when feature flag tests fail.' : `Does task number ${index} for the repository.`,
    agents: [agents[index % agents.length]],
    invocation: invocations[index % invocations.length],
    tools: index % 7 === 0 ? ['Read', 'Grep'] : [],
    properties: index % 5 === 0 ? { metadata: { owner: 'x' } } : {},
    warnings: [],
  }));
}

test('search and facets combine with AND; the facet counts follow the search', () => {
  const all = skills(40);
  const shown = applyFilters(all, { ...none, query: 'flag test' });
  assert.deepEqual(shown.map((skill: { name: string }) => skill.name), ['feature-flags-0', 'feature-flags-10', 'feature-flags-20', 'feature-flags-30']);
  // 0, 20: Claude Code; 10, 30: GitHub Copilot.
  const both = applyFilters(all, { ...none, query: 'flag test', agent: ['Claude Code'] });
  assert.deepEqual(both.map((skill: { name: string }) => skill.name), ['feature-flags-0', 'feature-flags-20']);

  const counts: Record<string, { value: string; count: number }[]> = facetCounts(all, { ...none, query: 'flag' });
  const count = (key: string, value: string) => counts[key].find((item: { value: string }) => item.value === value)?.count;
  assert.equal(count('agent', 'Claude Code'), 2);
  assert.equal(count('agent', 'GitHub Copilot'), 2);
  // No match, but still listed, so the page shows it disabled.
  assert.equal(count('agent', 'Custom agent'), 0);
  assert.equal(count('agent', 'Codex / AGENTS.md'), 0);
  assert.equal(count('type', 'model and user'), 2); // 0, 30
});

test('search: the query round-trips through the URL hash as q=', () => {
  const state = { repo: 'github.com/a/b', view: 'list', filters: { ...none, query: 'flag test' } };
  const hash = toHash(state);
  assert.equal(hash, 'repo=github.com%2Fa%2Fb&q=flag+test');
  assert.deepEqual(fromHash(`#${hash}`), state);
  assert.equal(toHash({ ...state, filters: none }), 'repo=github.com%2Fa%2Fb');
});

test('search: filtering 500 skills and counting their facets takes under 100 ms', () => {
  const all = skills(500);
  // Every prefix of the query, as it is typed; the slowest keystroke counts.
  let slowest = 0;
  for (const query of ['f', 'fl', 'fla', 'flag', 'flag ', 'flag t', 'flag te', 'flag tes', 'flag test']) {
    const start = performance.now();
    applyFilters(all, { ...none, query, agent: ['Claude Code'] });
    facetCounts(all, { ...none, query, agent: ['Claude Code'] });
    slowest = Math.max(slowest, performance.now() - start);
  }
  assert.ok(slowest < 100, `${slowest.toFixed(1)} ms`);
});
