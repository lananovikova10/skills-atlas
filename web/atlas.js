// The web view's logic without the DOM: facets, filters, the graph's elements and Markdown.
// The page imports it, and so do the tests.

/** The filter groups, in the order the page shows them. */
export const FACETS = [
  { key: 'agent', title: 'Agent' },
  { key: 'type', title: 'Type' },
  { key: 'tool', title: 'Allowed tools' },
  { key: 'property', title: 'Front matter' },
  { key: 'other', title: 'Other' },
];

export const TYPES = { 'model and user': 'Model & user', 'user only': 'User only (slash command)', 'model only': 'Model only', 'tool-restricted': 'Tool-restricted' };
export const OTHER = { shared: 'In several agents', warnings: 'Has warnings', undescribed: 'No description' };

/** One color per agent, in the order of the skill roots; unknown agents get the last. */
export const AGENT_COLORS = {
  'Claude Code': '#d97757',
  'Codex / AGENTS.md': '#10a37f',
  'GitHub Copilot': '#8250df',
  'Custom agent': '#0b7285',
  other: '#79747e',
};
export const agentColor = (agent) => AGENT_COLORS[agent] ?? AGENT_COLORS.other;

/** What a skill is, facet by facet: each a list of values. */
export function facetValues(skill) {
  const other = [];
  if (skill.agents.length > 1) other.push('shared');
  if (skill.warnings.length > 0) other.push('warnings');
  if (!skill.description) other.push('undescribed');
  return {
    agent: skill.agents,
    type: skill.tools.length > 0 ? [skill.invocation, 'tool-restricted'] : [skill.invocation],
    tool: skill.tools,
    property: Object.keys(skill.properties),
    other,
  };
}

/** Name or description contains every word of the query, case-insensitively. */
export function matchesQuery(skill, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${skill.name}\n${skill.description}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Filters: `{ query, agent: [...], type: [...], … }`. AND across groups, OR within one. */
export function matches(skill, filters, except) {
  if (!matchesQuery(skill, filters.query ?? '')) return false;
  const values = facetValues(skill);
  return FACETS.every(({ key }) => {
    const wanted = filters[key] ?? [];
    return key === except || wanted.length === 0 || wanted.some((value) => values[key].includes(value));
  });
}

export const applyFilters = (skills, filters) => skills.filter((skill) => matches(skill, filters));

/**
 * Every facet's values with how many skills each would show: the skills that match the
 * other groups' filters and have that value. Sorted by count, then by name.
 */
export function facetCounts(skills, filters) {
  const result = {};
  for (const { key } of FACETS) {
    const counts = new Map();
    for (const skill of skills) {
      for (const value of facetValues(skill)[key]) counts.set(value, counts.get(value) ?? 0);
    }
    for (const skill of skills) {
      if (!matches(skill, filters, key)) continue;
      for (const value of facetValues(skill)[key]) counts.set(value, counts.get(value) + 1);
    }
    result[key] = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }
  return result;
}

export function facetLabel(key, value) {
  if (key === 'type') return TYPES[value] ?? value;
  if (key === 'other') return OTHER[value] ?? value;
  return value;
}

/** `repo=…&view=graph&q=…&agent=a,b`: what the page shows, so it can be shared and reloaded. */
export function toHash(state) {
  const params = new URLSearchParams();
  if (state.repo) params.set('repo', state.repo);
  if (state.view && state.view !== 'list') params.set('view', state.view);
  if (state.filters.query) params.set('q', state.filters.query);
  for (const { key } of FACETS) {
    const values = state.filters[key] ?? [];
    if (values.length) params.set(key, values.join('\n'));
  }
  return params.toString();
}

export function fromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const filters = { query: params.get('q') ?? '' };
  for (const { key } of FACETS) filters[key] = params.get(key)?.split('\n').filter(Boolean) ?? [];
  return { repo: params.get('repo') ?? '', view: params.get('view') === 'graph' ? 'graph' : 'list', filters };
}

/**
 * The graph: the repository in the middle, an agent for each skill root, each skill linked to
 * the agents it is for; optionally the allowed tools and front matter keys the skills share.
 */
export function graphElements(repository, skills, { tools = false, properties = false } = {}) {
  const nodes = [{ data: { id: 'repo', label: repository.id, kind: 'repository' } }];
  const edges = [];
  const agents = new Set();
  const extra = new Map();
  const link = (source, target, kind) => edges.push({ data: { id: `${source}→${target}`, source, target, kind } });
  for (const skill of skills) {
    nodes.push({ data: { id: `skill:${skill.id}`, label: skill.name, kind: 'skill', skill: skill.id, color: agentColor(skill.agents[0]) } });
    for (const agent of skill.agents) {
      if (!agents.has(agent)) {
        agents.add(agent);
        nodes.push({ data: { id: `agent:${agent}`, label: agent, kind: 'agent', color: agentColor(agent) } });
        link('repo', `agent:${agent}`, 'agent');
      }
      link(`agent:${agent}`, `skill:${skill.id}`, 'skill');
    }
    const shared = [...(tools ? skill.tools.map((tool) => ['tool', tool]) : []), ...(properties ? Object.keys(skill.properties).map((key) => ['property', key]) : [])];
    for (const [kind, value] of shared) {
      const id = `${kind}:${value}`;
      if (!extra.has(id)) {
        extra.set(id, true);
        nodes.push({ data: { id, label: value, kind } });
      }
      link(`skill:${skill.id}`, id, kind);
    }
  }
  return [...nodes, ...edges];
}

const escape = (text) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const unescape = (text) => text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

/** A link's target: http(s) as it is, a relative one against the skill file; anything else is not a link. */
function resolve(href, base) {
  try {
    const url = new URL(unescape(href), base);
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function inline(text, base) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (link, label, href) => {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href) ? undefined : resolve(href, base);
      return url ? `<a href="${escape(url)}" target="_blank" rel="noopener">${label}</a>` : link;
    });
}

/**
 * A small, safe subset of Markdown: headings, fenced code, lists, quotes and paragraphs, with
 * inline code, bold, italics and links: http(s), or relative to `base`, the skill file's link.
 * Everything else is text: HTML is escaped.
 */
export function renderMarkdown(markdown, base) {
  const out = [];
  const lines = markdown.split('\n');
  let paragraph = [];
  let list;
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '), base)}</p>`);
    paragraph = [];
    if (list) out.push(`</${list}>`);
    list = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i]);
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 6); // the sheet's title is the h2
      out.push(`<h${level}>${inline(heading[2], base)}</h${level}>`);
    } else if (item) {
      const kind = item[1] ? 'ul' : 'ol';
      if (paragraph.length || list !== kind) flush();
      if (!list) out.push(`<${(list = kind)}>`);
      out.push(`<li>${inline(item[2], base)}</li>`);
    } else if (/^>\s?/.test(line)) {
      flush();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''), base)}</blockquote>`);
    } else if (!line.trim()) flush();
    else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

export function firstSentence(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
