/// <reference lib="dom" />
// The page itself, web/app.js, in a simulated browser (happy-dom) against the real server over
// ./fixture: the live search as a user types, clears and reloads it. Cytoscape is replaced by a
// stub that keeps what the graph or the map was given; the graph's elements are tested in web.test.ts.
// The map's model is answered from tests/model, the full model's rows for these skills' tokens.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { Source } from '../src/core/scan.ts';
import { startServer } from '../src/serve.ts';
import { AGENT_COLORS, AGENT_LOGOS } from '../web/atlas.js';
import { MODEL } from '../web/embed.js';
import { EXAMPLE_UPDATE, FIXTURE, open } from './helpers.ts';

// The model's files, from tests/model; what the page asked Hugging Face, and whether it answers.
const MODEL_FILES = new URL('model/', import.meta.url);
const NodeResponse = Response;
const modelAsked: string[] = [];
let modelAnswers = true;
async function answerModel(url: string) {
  modelAsked.push(url.slice(MODEL.length));
  if (!modelAnswers) return new NodeResponse('', { status: 503, statusText: 'Service Unavailable' });
  return new NodeResponse(await readFile(new URL(url.slice(MODEL.length), MODEL_FILES)));
}

const CYTOSCAPE_STUB = `data:text/javascript,${encodeURIComponent(`
export default function cytoscape() {
  const none = { remove() {}, removeClass() {}, not: () => ({ addClass() {} }) };
  let added = [];
  return {
    on() {}, style() {}, fit() {}, resize() {}, center() {}, zoom: () => 1,
    add(elements) { globalThis.graphElements = elements; globalThis.adds = (globalThis.adds ?? 0) + 1; added = elements; globalThis.faded = new Set(); },
    nodes: () => ({ forEach: (each) => added.filter((element) => element.data.kind === 'skill').forEach((element) => each({
      data: (key) => element.data[key],
      toggleClass: (name, on) => (on ? globalThis.faded.add(element.data.label) : globalThis.faded.delete(element.data.label)),
    })) }),
    elements: () => none,
    layout: () => ({ run() {} }),
  };
}`)}`;
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === '/vendor/cytoscape.mjs' ? { url: CYTOSCAPE_STUB, shortCircuit: true } : next(specifier, context),
});

/** The fixture's last updates, in days before now, by directory; writing-lint-checks has none. */
const DAYS_AGO: Record<string, number> = {
  '.claude/skills/reviewer': 40,
  '.github/skills/code-style': 3,
  '.claude/skills/commits': 400,
  '.agents/skills/commits': 10,
  '.github/skills/Commits': 400,
  '.agents/skills/release-checklist': 400,
};
const withDates = (source: Source): Source =>
  source.repository.id !== 'fixture' ? source : {
    ...source,
    lastUpdated: async (directory) =>
      directory in DAYS_AGO ? { date: new Date(Date.now() - DAYS_AGO[directory] * 86_400_000).toISOString(), commit: `c-${directory}` } : undefined,
  };

// The token each scan was asked with, as the server got it from the page.
const tokens: (string | undefined)[] = [];
const { server, url } = await startServer({ open: async (input, token) => (tokens.push(token), withDates(await open(input))), port: 0 });
after(async () => {
  await GlobalRegistrator.unregister();
  server.close();
});

// The page without its script and stylesheet: the test loads the script itself, once per page load.
const page = (await readFile(new URL('../web/index.html', import.meta.url), 'utf8'))
  .replace(/^<!doctype html>/i, '')
  .replace(/<script[^>]*><\/script>|<link[^>]*>/g, '');
const app = new URL('../web/app.js', import.meta.url).href;
let loads = 0;

// In the list's order: grouped by agents (Claude Code; all three; Codex; GitHub Copilot; Custom agent).
const ALL = ['code-review', 'commits', 'release-checklist', 'code-style', 'writing-lint-checks'];
const hash = (query: string) => `#repo=${encodeURIComponent(FIXTURE)}${query}`;

/** Opens the page at `#<hash>`, as a reload or a shared link does, and waits for its scan. */
async function load(at: string) {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register({ url: `${url}${at}` });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = ((input: string, init?: RequestInit) =>
    String(input).startsWith(MODEL) ? answerModel(String(input)) : pageFetch(input, init)) as typeof fetch;
  modelAsked.length = 0;
  modelAnswers = true;
  document.documentElement.innerHTML = page;
  await import(`${app}?load=${++loads}`);
  await until(() => !$('result').hidden);
}

const $ = (id: string) => document.getElementById(id) as HTMLElement & HTMLInputElement;

async function until(check: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${check}`);
}

/** The skill cards' names, in order. */
const listed = () => [...document.querySelectorAll('#list-view .skill-card h3')].map((title) => title.textContent);

/** One keystroke at a time, as a user types: an `input` event each, no Enter. */
function type(text: string) {
  const search = $('search');
  const shown: string[][] = [];
  for (const char of text) {
    search.value += char;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    shown.push(listed());
  }
  return shown;
}

/** A facet's chips: label → count and whether it can be clicked. */
function chips(title: string) {
  const facet = [...document.querySelectorAll('#facets .facet')].find((element) => element.querySelector('h3')?.textContent === title);
  assert.ok(facet, title);
  return new Map([...facet.querySelectorAll('button.chip')].map((chip) => {
    const count = chip.querySelector('.count')?.textContent ?? '';
    const label = (chip.textContent ?? '').slice(0, -count.length);
    return [label, { count: Number(count), disabled: (chip as HTMLButtonElement).disabled, element: chip as HTMLButtonElement }];
  }));
}

const press = (target: EventTarget, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => load(hash('')));

test('page: typing filters the list on every keystroke, without Enter', () => {
  assert.deepEqual(listed(), ALL);
  assert.equal($('summary-text').textContent, '5 skills');
  const shown = type('comm');
  // `c` is in every name; `co` and `com` also match "committing" in code-style's description.
  assert.deepEqual(shown, [
    ALL,
    ['code-review', 'commits', 'code-style'],
    ['commits', 'code-style'],
    ['commits', 'code-style'],
  ]);
  assert.equal($('summary-text').textContent, 'Showing 2 of 5 skills');
});

test('page: the match is case-insensitive, by every word, over the name and the description', () => {
  type('  PULL review ');
  assert.deepEqual(listed(), ['code-review']);
  $('search').value = '';
  type('lint tests');
  assert.deepEqual(listed(), ['writing-lint-checks']);
});

test('page: the count is announced to screen readers', () => {
  assert.equal($('summary-text').getAttribute('aria-live'), 'polite');
  type('lint');
  assert.equal($('summary-text').textContent, 'Showing 1 of 5 skills');
});

test('page: search and facets combine with AND; the counts follow the search; 0 is disabled', () => {
  type('commit');
  let agents = chips('Agent');
  assert.equal(agents.get('Claude Code')?.count, 1);
  assert.equal(agents.get('GitHub Copilot')?.count, 2); // commits, code-style
  assert.equal(agents.get('Custom agent')?.count, 0);
  assert.equal(agents.get('Custom agent')?.disabled, true);
  assert.equal(chips('Type').get('Model & user')?.count, 1);

  agents.get('Claude Code')?.element.click();
  assert.deepEqual(listed(), ['commits']);
  assert.equal($('summary-text').textContent, 'Showing 1 of 5 skills');
  // The type counts are now among the Claude Code skills that match the search.
  assert.equal(chips('Type').get('User only (slash command)')?.count, 0);
  agents = chips('Agent');
  assert.equal(agents.get('Claude Code')?.count, 1);
});

test('page: nothing matches → an empty state with a working Clear search', () => {
  type('deploy');
  assert.deepEqual(listed(), []);
  assert.equal($('empty').hidden, false);
  assert.equal($('empty-text').textContent, 'No skills match "deploy"');
  assert.equal($('empty-clear').hidden, false);
  $('empty-clear').click();
  assert.equal($('search').value, '');
  assert.deepEqual(listed(), ALL);
  assert.equal($('empty').hidden, true);
  assert.equal($('summary-text').textContent, '5 skills');
  assert.equal(document.activeElement, $('search'));
});

test('page: Clear search keeps the facets; facets alone are not a search', async () => {
  chips('Agent').get('Claude Code')?.element.click();
  type('deploy');
  $('empty-clear').click();
  assert.deepEqual(listed(), ['code-review', 'commits']);
  // Only a query shows "Showing N of M" and the Clear search action.
  assert.equal($('summary-text').textContent, '5 skills');
  // A chip with no match is disabled, so only a link can ask for facets that match nothing.
  await load(hash('&agent=Custom+agent&type=user+only'));
  assert.deepEqual(listed(), []);
  assert.equal($('empty-text').textContent, 'No skills match these filters.');
  assert.equal($('empty-clear').hidden, true);
});

test('page: the ✕ in the field clears the query', () => {
  assert.equal($('search-clear').hidden, true);
  type('lint');
  assert.equal($('search-clear').hidden, false);
  assert.equal($('search-clear').getAttribute('aria-label'), 'Clear search');
  $('search-clear').click();
  assert.equal($('search').value, '');
  assert.deepEqual(listed(), ALL);
  assert.equal($('search-clear').hidden, true);
});

test('page: Esc in the field clears the query', () => {
  $('search').focus();
  type('lint');
  assert.equal(press($('search'), 'Escape').defaultPrevented, true);
  assert.equal($('search').value, '');
  assert.deepEqual(listed(), ALL);
  assert.ok(!location.hash.includes('q='));
});

test('page: Clear filters clears the search and every facet', () => {
  chips('Agent').get('Claude Code')?.element.click();
  type('review');
  assert.deepEqual(listed(), ['code-review']);
  $('clear-filters').click();
  assert.equal($('search').value, '');
  assert.deepEqual(listed(), ALL);
  assert.equal(chips('Agent').get('Claude Code')?.element.getAttribute('aria-pressed'), 'false');
  assert.equal($('search-clear').hidden, true);
  assert.equal(location.hash, hash(''));
});

test('page: the query is in the URL hash; a reload restores the filtered view', async () => {
  type('lint');
  assert.equal(location.hash, hash('&q=lint'));
  await load(hash('&q=commit+every'));
  assert.equal($('search').value, 'commit every');
  assert.deepEqual(listed(), ['commits']);
  assert.equal($('summary-text').textContent, 'Showing 1 of 5 skills');
});

test('page: analysing another repository keeps the query', async () => {
  type('commit');
  $('repo').value = 'github.com/JetBrains/example';
  $('repo-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await until(() => $('repo-link').textContent === 'JetBrains/example');
  assert.equal($('search').value, 'commit');
  assert.deepEqual(listed(), ['commits']);
  assert.equal($('summary-text').textContent, `Showing 1 of 1 skill · 5ab6270`);
  assert.equal(location.hash, '#repo=github.com%2FJetBrains%2Fexample&q=commit');
});

test('page: the graph shows only the matching skills', async () => {
  type('review');
  (document.querySelector('[data-view="graph"]') as HTMLButtonElement).click();
  await until(() => Boolean((globalThis as { graphElements?: unknown }).graphElements));
  const skills = () =>
    ((globalThis as { graphElements?: { data: { kind: string; label: string } }[] }).graphElements ?? [])
      .filter((element) => element.data.kind === 'skill' && !('source' in element.data))
      .map((element) => element.data.label);
  assert.deepEqual(skills(), ['code-review']);
  assert.equal($('graph-view').hidden, false);
  assert.equal($('list-view').hidden, true);
  $('search').value = '';
  type('commit');
  assert.deepEqual(skills(), ['code-style', 'commits']);
  type('zzz');
  assert.equal($('graph-view').hidden, true);
  assert.equal($('empty-text').textContent, 'No skills match "commitzzz"');
});

test('page: / focuses the search, unless focus is already in a field', () => {
  assert.notEqual(document.activeElement, $('search'));
  const event = press(document.body, '/');
  assert.equal(document.activeElement, $('search'));
  assert.equal(event.defaultPrevented, true); // the `/` is not typed into the field

  $('repo').focus();
  const typing = press($('repo'), '/');
  assert.equal(document.activeElement, $('repo'));
  assert.equal(typing.defaultPrevented, false);
});

test('page: a GitHub token field, optional and hidden as typed, with a hint', () => {
  assert.equal($('token').type, 'password');
  assert.equal($('token').required, false);
  assert.equal($('token').value, '');
  assert.equal($('token').getAttribute('autocomplete'), 'off');
  assert.equal($('token').closest('label')?.querySelector('.text-field-label')?.textContent, 'GitHub token');
  const hint = document.getElementById($('token').getAttribute('aria-describedby') ?? '')?.textContent ?? '';
  assert.match(hint, /rate limit/);
  assert.match(hint, /never put in the link/);
});

/** Types a token and presses Analyse; resolves once the scan is shown. */
async function analyseWith(token: string) {
  tokens.length = 0;
  $('token').value = token;
  $('repo-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await until(() => tokens.length === 1 && !$('analyse').disabled);
}

test('page: Analyse sends the token to the scan; never in the URL hash', async () => {
  type('commit');
  await analyseWith(' ghp_secret ');
  assert.deepEqual(tokens, ['ghp_secret']);
  assert.ok(!location.hash.includes('ghp_secret'), location.hash);
  assert.ok(!location.href.includes('ghp_secret'), location.href);
  assert.equal(location.hash, hash('&q=commit'));
  assert.deepEqual(listed(), ['commits', 'code-style']);
  assert.equal($('token').value, ' ghp_secret ');
});

test('page: an empty token field sends no token', async () => {
  await analyseWith('ghp_secret');
  await analyseWith('');
  assert.deepEqual(tokens, [undefined]);
});

test('page: nothing is stored: a reload forgets the token and scans without one', async () => {
  await analyseWith('ghp_secret');
  tokens.length = 0;
  await load(location.hash);
  assert.equal($('token').value, '');
  assert.deepEqual(tokens, [undefined]);
  assert.equal(localStorage.length, 0);
  assert.equal(sessionStorage.length, 0);
});

/** The list's groups: title (its text) → the names of its cards. */
const groups = () => [...document.querySelectorAll('#list-view .skill-group')].map((group) => [
  group.querySelector('.group-title')?.textContent,
  [...group.querySelectorAll('.skill-card h3')].map((title) => title.textContent),
]);

/** The agents whose logos an element shows, by their path, and in which color. */
const logos = (element: Element) => [...element.querySelectorAll('svg.logo')].map((svg) => {
  const d = svg.querySelector('path')?.getAttribute('d');
  return [Object.keys(AGENT_LOGOS).find((agent) => AGENT_LOGOS[agent as keyof typeof AGENT_LOGOS] === d), svg.getAttribute('style')];
});

const card = (name: string) => [...document.querySelectorAll('#list-view .skill-card')].find((element) => element.querySelector('h3')?.textContent === name) as HTMLElement;

/** A card's highlighted parts: the text of each <mark> in its name and in its description. */
const marks = (name: string) => [...card(name).querySelectorAll('h3 mark, p mark')].map((mark) => mark.textContent);

const map = globalThis as { graphElements?: { data: { kind: string; label: string; topic?: number } }[]; adds?: number; faded?: Set<string> };
const view = (name: string) => (document.querySelector(`[data-view="${name}"]`) as HTMLButtonElement).click();
const mapReady = () => until(() => !$('map').hidden);
const points = () => (map.graphElements ?? []).filter(({ data }) => data.kind === 'skill').map(({ data }) => data.label);

/** Each card's last update: its text, its tooltip and its link. */
const updates = () =>
  [...document.querySelectorAll('#list-view .skill-item .updated')].map((element) => ({
    text: element.textContent,
    title: element.getAttribute('title'),
    href: element.getAttribute('href'),
  }));

const sortBy = (value: string) => {
  const sort = $('sort') as unknown as HTMLSelectElement;
  sort.value = value;
  sort.dispatchEvent(new Event('change', { bubbles: true }));
};

test('page: each card shows when its skill was last updated, the absolute date on hover', () => {
  const shown = updates();
  assert.deepEqual(shown.map((update) => update.text), [
    'Updated 1 month ago', // code-review, 40 days
    'Updated 10 days ago', // commits: its copy in .agents, the latest of its three files
    'Updated 1 year ago', // release-checklist, 400 days
    'Updated 3 days ago', // code-style
    'Last update unknown', // writing-lint-checks
  ]);
  assert.match(shown[3].title ?? '', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  assert.equal(shown[4].title, null);
  // A local directory's commit has no page to link to.
  assert.ok(shown.every((update) => update.href === null));
  // Not inside the card's button: a button cannot hold a link.
  assert.equal(document.querySelector('.skill-card .updated'), null);
});

test('page: on GitHub, the date links to the commit', async () => {
  $('repo').value = 'github.com/JetBrains/example';
  $('repo-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await until(() => $('repo-link').textContent === 'JetBrains/example');
  const [update] = updates();
  assert.match(update.text ?? '', /^Updated (just now|\d+ (minute|hour|day|month|year)s? ago)$/);
  assert.equal(update.title, '2026-10-17 09:30 UTC');
  assert.equal(update.href, `https://github.com/JetBrains/example/commit/${EXAMPLE_UPDATE.commit}`);
  const link = document.querySelector('#list-view a.updated');
  assert.equal(link?.getAttribute('target'), '_blank');
  assert.equal(link?.getAttribute('rel'), 'noopener');
});

test('page: Sort, by name by default, or by last update within each group; the groups stay', async () => {
  const sort = $('sort') as unknown as HTMLSelectElement;
  assert.equal(sort.closest('label')?.querySelector('.text-field-label')?.textContent, 'Sort');
  assert.deepEqual([...sort.options].map((option) => [option.value, option.textContent]), [['name', 'Name'], ['updated', 'Last updated']]);
  assert.equal(sort.value, 'name');
  assert.deepEqual(listed(), ALL);
  const byName = groups();
  // The fixture has one skill per group: the order within a group is tested in web.test.ts.
  sortBy('updated');
  assert.deepEqual(groups(), byName);
  assert.equal(location.hash, hash('&sort=updated'));
  sortBy('name');
  assert.deepEqual(listed(), ALL);
  assert.equal(location.hash, hash(''));
  // The graph and the map have no order: the control is the list's only.
  assert.equal($('sort-field').hidden, false);
  (globalThis as { graphElements?: unknown }).graphElements = undefined;
  view('graph');
  assert.equal($('sort-field').hidden, true);
  await until(() => Boolean((globalThis as { graphElements?: unknown }).graphElements));
  view('map');
  assert.equal($('sort-field').hidden, true);
  await mapReady();
  view('list');
  assert.equal($('sort-field').hidden, false);
});

test('page: the sort combines with the search and the facets; Clear filters keeps it', () => {
  sortBy('updated');
  chips('Agent').get('Claude Code')?.element.click();
  assert.deepEqual(listed(), ['code-review', 'commits']);
  type('e');
  assert.deepEqual(listed(), ['code-review', 'commits']);
  chips('Agent').get('Claude Code')?.element.click();
  assert.deepEqual(listed(), ALL);
  $('search').value = '';
  type('lint');
  assert.deepEqual(listed(), ['writing-lint-checks']);
  $('clear-filters').click();
  assert.equal(($('sort') as unknown as HTMLSelectElement).value, 'updated');
  assert.deepEqual(listed(), ALL);
});

test('page: the sort is in the URL hash; a reload restores it', async () => {
  await load(hash('&sort=updated&q=commit'));
  assert.equal(($('sort') as unknown as HTMLSelectElement).value, 'updated');
  assert.deepEqual(listed(), ['commits', 'code-style']);
  assert.equal(location.hash, hash('&sort=updated&q=commit'));
});

test('page: the sheet shows the last update too', () => {
  (document.querySelector('#list-view .skill-card') as HTMLButtonElement).click();
  assert.equal($('sheet-title').textContent, 'code-review');
  assert.equal(document.querySelector('#sheet-body .sheet-updated')?.textContent, 'Updated 1 month ago');
});

test('page: the list is grouped by agents, in root order, each skill in one group, with a count', () => {
  assert.deepEqual(groups(), [
    ['Claude Code1', ['code-review']],
    ['Claude Code+Codex / AGENTS.md+GitHub Copilot1', ['commits']],
    ['Codex / AGENTS.md1', ['release-checklist']],
    ['GitHub Copilot1', ['code-style']],
    ['Custom agent1', ['writing-lint-checks']],
  ]);
  const titles = [...document.querySelectorAll('#list-view .group-title')];
  assert.deepEqual([...titles[1].querySelectorAll('.plus')].map((plus) => plus.textContent), ['+', '+']);
  assert.deepEqual([...document.querySelectorAll('#list-view .group-title .count')].map((count) => count.textContent), ['1', '1', '1', '1', '1']);
  assert.equal(document.querySelectorAll('#list-view .skill-card').length, 5);
});

test('page: the groups follow the search and the chips; a group with no skill is not shown', () => {
  type('commit');
  assert.deepEqual(groups(), [
    ['Claude Code+Codex / AGENTS.md+GitHub Copilot1', ['commits']],
    ['GitHub Copilot1', ['code-style']],
  ]);
  chips('Agent').get('Claude Code')?.element.click();
  assert.deepEqual(groups(), [['Claude Code+Codex / AGENTS.md+GitHub Copilot1', ['commits']]]);
  type('zzz');
  assert.equal(document.querySelectorAll('#list-view .skill-group').length, 0);
});

test('page: each agent has its logo, in its color: group titles, cards, Agent chips, the sheet', () => {
  const color = (agent: keyof typeof AGENT_COLORS) => `color:${AGENT_COLORS[agent]}`;
  const all = [['Claude Code', color('Claude Code')], ['Codex / AGENTS.md', color('Codex / AGENTS.md')], ['GitHub Copilot', color('GitHub Copilot')]];
  const titles = [...document.querySelectorAll('#list-view .group-title')];
  assert.deepEqual(logos(titles[1]), all);
  // The custom agent's logo is the one for any other agent.
  assert.deepEqual(logos(titles[4]), [['other', color('Custom agent')]]);
  assert.deepEqual(logos(card('commits').querySelector('.tags') as Element), all);
  assert.deepEqual(logos(chips('Agent').get('GitHub Copilot')?.element as Element), [['GitHub Copilot', color('GitHub Copilot')]]);
  card('commits').click();
  assert.deepEqual(logos($('sheet-body').querySelector('.files') as Element), all);
});

test('page: a card\'s accent is its canonical agent\'s color', () => {
  assert.equal(card('commits').style.getPropertyValue('--accent'), AGENT_COLORS['Claude Code']);
  assert.equal(card('code-style').style.getPropertyValue('--accent'), AGENT_COLORS['GitHub Copilot']);
  assert.equal(card('writing-lint-checks').style.getPropertyValue('--accent'), AGENT_COLORS['Custom agent']);
});

test('page: the search\'s words are highlighted in the name and the description, as typed and cleared', () => {
  assert.deepEqual(marks('commits'), []);
  type('COMM');
  // Every place, in either field; the text keeps its case.
  assert.deepEqual(marks('commits'), ['comm', 'comm']);
  assert.equal(card('commits').querySelector('h3')?.innerHTML, '<mark>comm</mark>its');
  assert.equal(card('code-style').querySelector('h3')?.innerHTML, 'code-style');
  $('search').value = '';
  type(' pull  review ');
  assert.equal(card('code-review').querySelector('h3')?.innerHTML, 'code-<mark>review</mark>');
  // Only what the card shows: "pull" is in the description's second sentence, not on the card.
  assert.equal(card('code-review').querySelector('p')?.innerHTML, '<mark>Review</mark> a change before it is merged.');
  press($('search'), 'Escape');
  assert.equal(document.querySelectorAll('#list-view mark').length, 0);
});

test('map: the model is downloaded only when the map is opened, once per page', async () => {
  view('graph');
  view('list');
  assert.deepEqual(modelAsked, []);
  view('map');
  assert.equal($('map-status').textContent, 'Downloading the model, potion-base-8M (30 MB)…');
  assert.equal($('map').hidden, true);
  await mapReady();
  assert.deepEqual(modelAsked, ['vocab.txt', 'model.safetensors']);
  view('list');
  view('map');
  assert.deepEqual(modelAsked, ['vocab.txt', 'model.safetensors']);
  assert.equal(location.hash, hash('&view=map'));
});

test('map: every skill a point with its topic, the topics labelled, in the legend and in Topic chips first', async () => {
  await load(hash('&view=map'));
  await mapReady();
  assert.deepEqual(points(), [...ALL].sort());
  const topics = (map.graphElements ?? []).filter(({ data }) => data.kind === 'topic').map(({ data }) => data.label);
  assert.ok(topics.length >= 1);
  assert.equal($('map-status').textContent, `5 skills in ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}, placed by what they say they do`);
  assert.deepEqual([...$('map-legend').querySelectorAll('span')].slice(0, -1).map((span) => span.textContent), topics);
  assert.equal(document.querySelector('#facets .facet h3')?.textContent, 'Topic');
  assert.deepEqual([...chips('Topic').keys()].sort(), [...topics].sort());
  assert.equal([...chips('Topic').values()].reduce((sum, { count }) => sum + count, 0), 5);
});

test('map: the search and the chips fade the other skills; nothing moves; nothing matches → the empty state', async () => {
  await load(hash('&view=map'));
  await mapReady();
  const adds = map.adds;
  type('commit');
  assert.deepEqual([...(map.faded ?? [])].sort(), ['code-review', 'release-checklist', 'writing-lint-checks']);
  assert.equal(map.adds, adds); // the same layout, only faded
  chips('Agent').get('Claude Code')?.element.click();
  assert.deepEqual([...(map.faded ?? [])].sort(), ['code-review', 'code-style', 'release-checklist', 'writing-lint-checks']);
  type('zzz');
  assert.equal($('map-view').hidden, true);
  assert.equal($('empty').hidden, false);
});

test('map: a Topic chip filters every view, and a link with topic= builds the map from the list', async () => {
  await load(hash('&view=map'));
  await mapReady();
  const [topic, { count }] = [...chips('Topic')][0];
  chips('Topic').get(topic)?.element.click();
  view('list');
  assert.equal(listed().length, count);
  const link = location.hash;
  assert.match(link, /topic=/);
  await load(link.replace('&view=map', ''));
  assert.ok(modelAsked.length > 0);
  await until(() => listed().length === count);
  assert.equal(chips('Topic').get(topic)?.element.getAttribute('aria-pressed'), 'true');
});

test('map: the sheet lists the most similar skills, each opening its own sheet', async () => {
  (document.querySelector('#list-view .skill-card') as HTMLButtonElement).click();
  assert.ok(![...document.querySelectorAll('#sheet-body h4')].some((h4) => h4.textContent === 'Similar skills'));
  view('map');
  await mapReady();
  view('list');
  (document.querySelector('#list-view .skill-card') as HTMLButtonElement).click();
  assert.equal($('sheet-title').textContent, 'code-review');
  const similar = [...document.querySelectorAll('#sheet-body .similar button')] as HTMLButtonElement[];
  assert.equal(similar.length, 4);
  assert.deepEqual(similar.map((button) => button.textContent).sort(), ALL.filter((name) => name !== 'code-review').sort());
  assert.ok(similar.every((button) => /^\d+% similar$/.test(button.title)));
  const first = similar[0].textContent;
  similar[0].click();
  assert.equal($('sheet-title').textContent, first);
});

test('map: the model cannot be downloaded → the reason; the next scan tries again', async () => {
  modelAnswers = false;
  view('map');
  await until(() => $('map-status').classList.contains('error'));
  assert.equal($('map-status').textContent, 'Could not build the map: Could not download the model: vocab.txt: 503 Service Unavailable');
  assert.equal($('map').hidden, true);
  modelAnswers = true;
  $('repo-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await mapReady();
  assert.equal($('map-status').classList.contains('error'), false);
});
