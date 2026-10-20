// The page: the repository field, the filters, the list and graph views and the skill sheet.
import { agentColor, applyFilters, FACETS, facetCounts, facetLabel, firstSentence, fromHash, renderMarkdown, toHash, TYPES } from './atlas.js';

const $ = (id) => document.getElementById(id);
const state = { ...fromHash(location.hash), result: undefined };
let graph;

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value);
  }
  node.append(...children.flat().filter((child) => child !== undefined && child !== null));
  return node;
}

const saveHash = () => history.replaceState(null, '', `#${toHash(state)}`);

async function analyse(repo) {
  state.repo = repo;
  saveHash();
  $('error').hidden = true;
  $('progress').hidden = false;
  $('analyse').disabled = true;
  try {
    const response = await fetch(`/api/scan?repo=${encodeURIComponent(repo)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? response.statusText);
    state.result = body;
    showResult();
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
    $('result').hidden = true;
  } finally {
    $('progress').hidden = true;
    $('analyse').disabled = false;
  }
}

function showResult() {
  const { repository, warnings, ignored } = state.result;
  $('result').hidden = false;
  $('repo-link').href = repository.commit ? `${repository.url}/tree/${repository.commit}` : repository.url;
  $('repo-link').textContent = repository.id;
  const notes = [...warnings.map((text) => `warning: ${text}`), ...ignored.map((item) => `ignored: ${item.path}: ${item.reason}`)];
  $('notes').textContent = notes.join('\n');
  $('notes').hidden = true;
  $('show-notes').hidden = notes.length === 0;
  $('show-notes').textContent = `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'} · ${ignored.length} ignored`;
  update();
}

function update() {
  if (!state.result) return;
  saveHash();
  const { repository, skills } = state.result;
  const shown = applyFilters(skills, state.filters);
  const query = state.filters.query.trim();
  renderFacets(skills);
  // Announced to screen readers as it changes: the summary is aria-live.
  const commit = repository.commit ? ` · ${repository.commit.slice(0, 7)}` : '';
  const count = query ? `Showing ${shown.length} of ${skills.length}` : String(skills.length);
  $('summary-text').textContent = `${count} ${skills.length === 1 ? 'skill' : 'skills'}${commit}`;
  $('search-clear').hidden = !state.filters.query;
  $('empty').hidden = shown.length > 0;
  $('empty-text').textContent = query ? `No skills match "${query}"` : 'No skills match these filters.';
  $('empty-clear').hidden = !query;
  $('list-view').hidden = state.view !== 'list';
  $('graph-view').hidden = state.view !== 'graph' || shown.length === 0;
  for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  if (state.view === 'list') renderList(shown);
  else renderGraph(shown);
}

function renderFacets(skills) {
  const counts = facetCounts(skills, state.filters);
  $('facets').replaceChildren(
    ...FACETS.filter(({ key }) => counts[key].length > 0).map(({ key, title }) =>
      element('div', { class: 'facet' }, element('h3', {}, title), element('div', { class: 'chips' },
        counts[key].map(({ value, count }) => {
          const selected = state.filters[key].includes(value);
          return element('button', {
            class: 'chip', type: 'button', 'aria-pressed': String(selected), ...(count === 0 && !selected ? { disabled: '' } : {}),
            onclick: () => {
              state.filters[key] = selected ? state.filters[key].filter((other) => other !== value) : [...state.filters[key], value];
              update();
            },
          },
          key === 'agent' ? element('span', { class: 'dot', style: `width:8px;height:8px;border-radius:50%;background:${agentColor(value)}` }) : undefined,
          facetLabel(key, value), element('span', { class: 'count' }, String(count)));
        }),
      )),
    ),
  );
}

function skillTags(skill) {
  return element('div', { class: 'tags' },
    skill.agents.map((agent) => element('span', { class: 'tag' }, element('span', { class: 'dot', style: `background:${agentColor(agent)}` }), agent)),
    element('span', { class: 'tag type' }, TYPES[skill.invocation]),
    skill.tools.length ? element('span', { class: 'tag type' }, `${skill.tools.length} allowed tools`) : undefined,
    skill.warnings.length ? element('span', { class: 'tag warn' }, `${skill.warnings.length} ${skill.warnings.length === 1 ? 'warning' : 'warnings'}`) : undefined,
  );
}

function renderList(skills) {
  $('list-view').replaceChildren(...skills.map((skill) =>
    element('button', { class: 'skill-card', type: 'button', onclick: () => openSheet(skill.id) },
      element('h3', {}, skill.name),
      element('p', {}, skill.description ? firstSentence(skill.description) : 'No description'),
      skillTags(skill),
    ),
  ));
}

async function renderGraph(skills) {
  if (!graph) {
    const { createGraph } = await import('./graph.js');
    graph = createGraph($('graph'), { onSelect: openSheet });
  }
  graph.resize();
  graph.render(state.result.repository, skills, { tools: $('graph-tools').checked, properties: $('graph-keys').checked });
  const agents = [...new Set(skills.flatMap((skill) => skill.agents))];
  $('graph-legend').replaceChildren(
    ...agents.map((agent) => element('span', {}, element('i', { style: `background:${agentColor(agent)}` }), agent)),
    element('span', {}, 'Skills are colored by their canonical agent · scroll to zoom · drag to move'),
  );
}

function value(data) {
  if (data !== null && typeof data === 'object') return element('pre', {}, JSON.stringify(data, null, 2));
  return String(data);
}

function openSheet(id) {
  const skill = state.result.skills.find((candidate) => candidate.id === id);
  if (!skill) return;
  $('sheet-title').textContent = skill.name;
  const properties = Object.entries(skill.properties);
  const body = $('sheet-body');
  body.replaceChildren(...[
    element('p', { class: 'description' }, skill.description || 'No description'),
    element('h4', {}, 'Overview'),
    skillTags(skill),
    element('h4', {}, 'Front matter'),
    element('table', { class: 'props' }, element('tbody', {},
      element('tr', {}, element('th', {}, 'name'), element('td', {}, skill.name)),
      element('tr', {}, element('th', {}, 'description'), element('td', {}, skill.description || '—')),
      properties.map(([key, data]) => element('tr', {}, element('th', {}, key), element('td', {}, value(data)))),
    )),
    element('h4', {}, skill.files.length > 1 ? 'Files (canonical first)' : 'File'),
    element('ul', { class: 'files' }, skill.files.map((file) =>
      element('li', {},
        element('a', { href: file.link, target: '_blank', rel: 'noopener' }, file.path),
        element('span', { class: 'tag' }, element('span', { class: 'dot', style: `background:${agentColor(file.agent)}` }), file.agent),
      ),
    )),
    skill.warnings.length ? [element('h4', {}, 'Warnings'), element('ul', {}, skill.warnings.map((text) => element('li', {}, text)))] : undefined,
    skill.body ? [element('h4', {}, 'Content'), (() => {
      const markdown = element('div', { class: 'markdown' });
      markdown.innerHTML = renderMarkdown(skill.body, skill.link); // escaped by renderMarkdown
      return markdown;
    })()] : undefined,
  ].flat().filter(Boolean));
  body.scrollTop = 0;
  $('sheet').classList.add('open');
  $('sheet').setAttribute('aria-hidden', 'false');
  $('scrim').hidden = false;
  $('sheet-close').focus();
}

function closeSheet() {
  $('sheet').classList.remove('open');
  $('sheet').setAttribute('aria-hidden', 'true');
  $('scrim').hidden = true;
}

$('repo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  if (repo) analyse(repo);
});
/** The search, as typed: the list follows every keystroke; the filters and the view stay. */
function setQuery(query) {
  state.filters.query = query;
  if ($('search').value !== query) $('search').value = query;
  update();
}

const clearSearch = () => {
  setQuery('');
  $('search').focus();
};

$('search').addEventListener('input', () => setQuery($('search').value));
$('search').addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !$('search').value) return;
  event.preventDefault();
  setQuery('');
});
$('search-clear').addEventListener('click', clearSearch);
$('empty-clear').addEventListener('click', clearSearch);
$('clear-filters').addEventListener('click', () => {
  state.filters = fromHash('').filters;
  $('search').value = '';
  update();
});
for (const tab of document.querySelectorAll('[data-view]')) {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.view;
    if (state.result) update();
    else saveHash();
  });
}
$('show-notes').addEventListener('click', () => ($('notes').hidden = !$('notes').hidden));
$('graph-tools').addEventListener('change', update);
$('graph-keys').addEventListener('change', update);
$('graph-fit').addEventListener('click', () => graph?.fit());
$('sheet-close').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
  // `/` focuses the search, unless the user is typing somewhere already.
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target)) {
    event.preventDefault();
    $('search').focus();
  }
});

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

$('repo').value = state.repo;
$('search').value = state.filters.query;
for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
if (state.repo) analyse(state.repo);
