// The web view's logic without the DOM: facets, filters, the graph's elements and Markdown.
// The page imports it, and so do the tests.

/** The filter groups, in the order the page shows them. */
export const FACETS = [
  { key: 'topic', title: 'Topic' },
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

/**
 * Each agent's logo, an SVG path in a 24 × 24 box: Claude and GitHub Copilot from simple-icons (CC0);
 * Codex / AGENTS.md (no OpenAI mark is free to use) and the others: Material icons, terminal and smart_toy.
 */
export const AGENT_LOGOS = {
  'Claude Code': 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z',
  'Codex / AGENTS.md': 'M20 4H4c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4-4 4z',
  'GitHub Copilot': 'M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z',
  other: 'M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z',
};
export const agentLogo = (agent) => AGENT_LOGOS[agent] ?? AGENT_LOGOS.other;

/** What a skill is, facet by facet: each a list of values. Its topic, once the map has placed it. */
export function facetValues(skill) {
  const other = [];
  if (skill.agents.length > 1) other.push('shared');
  if (skill.warnings.length > 0) other.push('warnings');
  if (!skill.description) other.push('undescribed');
  return {
    topic: skill.topic ? [skill.topic] : [],
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

/** Where the query's words are in `text`: its parts, in order, each marked if it is a match. */
export function highlight(text, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const marked = new Array(text.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1)) marked.fill(true, at, at + word.length);
  }
  const parts = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1);
    if (last?.match === marked[i]) last.text += text[i];
    else parts.push({ text: text[i], match: marked[i] });
  }
  return parts;
}

const AGENT_ORDER = Object.keys(AGENT_COLORS);
const agentRank = (agent) => (AGENT_ORDER.includes(agent) ? AGENT_ORDER.indexOf(agent) : AGENT_ORDER.length);
const byRoot = (a, b) => agentRank(a) - agentRank(b) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * The list's groups: one per set of agents the skills are in, so each skill is in one group.
 * The agents in root order; the groups in that order too, a set before the longer ones it starts;
 * the skills in the order given.
 */
export function groupByAgents(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const agents = [...skill.agents].sort(byRoot);
    const key = agents.join('\n');
    if (!groups.has(key)) groups.set(key, { agents, skills: [] });
    groups.get(key).skills.push(skill);
  }
  return [...groups.values()].sort((a, b) => {
    for (let i = 0; i < Math.min(a.agents.length, b.agents.length); i++) {
      const order = byRoot(a.agents[i], b.agents[i]);
      if (order) return order;
    }
    return a.agents.length - b.agents.length;
  });
}

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
  const view = ['graph', 'map'].includes(params.get('view')) ? params.get('view') : 'list';
  return { repo: params.get('repo') ?? '', view, filters };
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
