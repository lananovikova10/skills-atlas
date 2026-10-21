// The map's logic without the DOM: the skills' vectors → a graph of their nearest neighbours → its
// communities, the topics, labelled by their most telling words → a 2D layout, UMAP's, where similar
// skills sit together. Everything is deterministic: the same skills give the same map. The map view
// imports it, and so do the tests.

/** What a skill's vector is made of: what it says it does. */
export const skillText = (skill) => `${skill.name}\n${skill.description}`;

/** How many neighbours each skill is linked to, and the most similar skills its sheet lists. */
const NEIGHBOURS = 10;
export const SIMILAR = 5;
const EPOCHS = 500;
// UMAP's curve 1 / (1 + a·d²ᵇ) with a = b = 1, t-SNE's: the layout needs only + − × ÷, which every
// machine rounds the same, so it is the same everywhere. A power with b ≠ 1 differs in its last bit
// between processors, and 500 epochs make that a different map.

/**
 * One hue per topic, largest first, each stepped for the light and the dark surface: eight
 * categorical hues that stay apart with color blindness. Topics after the eighth have none: gray.
 */
export const TOPIC_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
export const topicColor = (topic, dark) => TOPIC_COLORS[dark ? 'dark' : 'light'][topic];

/** A seeded random number generator (mulberry32): the map is the same on every run. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/** Each vector's `k` nearest others by cosine distance (the vectors are normalised), nearest first; ties by index. */
export function nearest(vectors, k) {
  return vectors.map((vector, i) =>
    vectors
      .map((other, j) => ({ index: j, distance: Math.max(0, 1 - dot(vector, other)) }))
      .filter(({ index }) => index !== i)
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .slice(0, k),
  );
}

/**
 * UMAP's fuzzy graph: each skill's neighbours weighted by how much nearer they are than its farther
 * ones, then made symmetric (a or b: a + b - ab). Edges `[i, j, weight]` with i < j, sorted.
 */
export function fuzzyGraph(neighbours) {
  // umap-learn counts the point itself among its neighbours.
  const target = Math.log2((neighbours[0]?.length ?? 0) + 1);
  const directed = new Map();
  neighbours.forEach((list, i) => {
    if (list.length === 0) return;
    const rho = list.find(({ distance }) => distance > 0)?.distance ?? 0;
    const mean = list.reduce((sum, { distance }) => sum + distance, 0) / list.length;
    let [low, high, sigma] = [0, Infinity, 1];
    for (let step = 0; step < 64; step++) {
      const sum = list.reduce((total, { distance }) => total + (distance > rho ? Math.exp(-(distance - rho) / sigma) : 1), 0);
      if (Math.abs(sum - target) < 1e-5) break;
      if (sum > target) [high, sigma] = [sigma, (low + sigma) / 2];
      else [low, sigma] = [sigma, high === Infinity ? sigma * 2 : (sigma + high) / 2];
    }
    sigma = Math.max(sigma, 1e-3 * mean);
    for (const { index, distance } of list) directed.set(`${i},${index}`, distance > rho ? Math.exp(-(distance - rho) / sigma) : 1);
  });
  const edges = new Map();
  for (const [key, weight] of directed) {
    const [i, j] = key.split(',').map(Number);
    const [a, b] = i < j ? [i, j] : [j, i];
    if (edges.has(`${a},${b}`)) continue;
    const other = directed.get(`${j},${i}`) ?? 0;
    edges.set(`${a},${b}`, [a, b, weight + other - weight * other]);
  }
  return [...edges.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/**
 * Louvain's communities of an undirected weighted graph: nodes move to the neighbouring community
 * that gains the most modularity, then each community becomes a node, until nothing moves.
 * Nodes are visited in order, so the result is deterministic. A community index per node.
 */
export function communities(size, edges) {
  let membership = Array.from({ length: size }, (_, i) => i);
  let nodes = size;
  let links = edges;
  for (;;) {
    const adjacency = Array.from({ length: nodes }, () => new Map());
    const degree = new Float64Array(nodes);
    let total = 0;
    for (const [a, b, weight] of links) {
      adjacency[a].set(b, (adjacency[a].get(b) ?? 0) + weight);
      if (a !== b) adjacency[b].set(a, (adjacency[b].get(a) ?? 0) + weight);
      degree[a] += weight;
      degree[b] += weight;
      total += weight;
    }
    if (total === 0) break;
    const community = Array.from({ length: nodes }, (_, i) => i);
    const sum = Float64Array.from(degree);
    let moved = false;
    for (let improved = true; improved;) {
      improved = false;
      for (let node = 0; node < nodes; node++) {
        const own = community[node];
        const into = new Map();
        for (const [other, weight] of adjacency[node]) if (other !== node) into.set(community[other], (into.get(community[other]) ?? 0) + weight);
        sum[own] -= degree[node];
        let [best, gain] = [own, (into.get(own) ?? 0) - (sum[own] * degree[node]) / (2 * total)];
        for (const [candidate, weight] of [...into].sort((x, y) => x[0] - y[0])) {
          const candidateGain = weight - (sum[candidate] * degree[node]) / (2 * total);
          if (candidateGain > gain + 1e-12) [best, gain] = [candidate, candidateGain];
        }
        sum[best] += degree[node];
        if (best !== own) {
          community[node] = best;
          improved = moved = true;
        }
      }
    }
    if (!moved) break;
    // The communities, renumbered in order of their first node, become the next level's nodes.
    const renumber = new Map();
    for (const value of community) if (!renumber.has(value)) renumber.set(value, renumber.size);
    membership = membership.map((node) => renumber.get(community[node]));
    const merged = new Map();
    for (const [a, b, weight] of links) {
      const [x, y] = [renumber.get(community[a]), renumber.get(community[b])].sort((p, q) => p - q);
      merged.set(`${x},${y}`, (merged.get(`${x},${y}`) ?? 0) + weight);
    }
    links = [...merged].map(([key, weight]) => [...key.split(',').map(Number), weight]);
    nodes = renumber.size;
  }
  return membership;
}

/** The two principal components of the vectors, by power iteration from a fixed start. */
function principal(vectors) {
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const vector of vectors) for (let i = 0; i < dim; i++) mean[i] += vector[i] / vectors.length;
  const centred = vectors.map((vector) => Float64Array.from(vector, (value, i) => value - mean[i]));
  const components = [];
  for (let c = 0; c < 2; c++) {
    let axis = Float64Array.from({ length: dim }, (_, i) => ((i * 7 + c * 3) % 11) - 5);
    for (let step = 0; step < 100; step++) {
      const next = new Float64Array(dim);
      for (const row of centred) {
        const projection = dot(row, axis);
        for (let i = 0; i < dim; i++) next[i] += projection * row[i];
      }
      for (const previous of components) {
        const overlap = dot(next, previous);
        for (let i = 0; i < dim; i++) next[i] -= overlap * previous[i];
      }
      const norm = Math.sqrt(dot(next, next));
      if (norm === 0) break;
      axis = next.map((value) => value / norm);
    }
    components.push(axis);
  }
  return centred.map((row) => components.map((axis) => dot(row, axis)));
}

/**
 * UMAP's layout of the fuzzy graph in 2D: from the principal components, edges pull their ends
 * together as often as they weigh, random others push them apart. Seeded: the same every time.
 */
export function layout(vectors, edges, { seed = 42, epochs = EPOCHS } = {}) {
  const size = vectors.length;
  if (size === 0) return [];
  if (size === 1) return [[0, 0]];
  const start = principal(vectors);
  const scale = Math.max(...start.flat().map(Math.abs)) || 1;
  const points = start.map(([x, y]) => [(x / scale) * 10, (y / scale) * 10]);
  const strongest = Math.max(0, ...edges.map(([, , weight]) => weight));
  // Both directions of each edge, as umap-learn optimises them; edges too weak to be sampled are left out.
  const sampled = edges.filter(([, , weight]) => weight >= strongest / epochs).flatMap(([a, b, weight]) => [[a, b, weight], [b, a, weight]]);
  const every = sampled.map(([, , weight]) => strongest / weight);
  const next = [...every];
  const everyNegative = every.map((value) => value / 5);
  const nextNegative = [...everyNegative];
  const rand = random(seed);
  const clip = (value) => Math.max(-4, Math.min(4, value));
  for (let epoch = 0; epoch < epochs; epoch++) {
    const alpha = 1 - epoch / epochs;
    sampled.forEach(([from, to], e) => {
      if (next[e] > epoch) return;
      const [p, q] = [points[from], points[to]];
      const d2 = (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]);
      const pull = d2 > 0 ? -2 / (d2 + 1) : 0;
      for (let k = 0; k < 2; k++) {
        const grad = clip(pull * (p[k] - q[k])) * alpha;
        p[k] += grad;
        q[k] -= grad;
      }
      next[e] += every[e];
      const negatives = Math.floor((epoch - nextNegative[e]) / everyNegative[e]);
      for (let n = 0; n < negatives; n++) {
        const other = Math.floor(rand() * size);
        if (other === from) continue;
        const o = points[other];
        const r2 = (p[0] - o[0]) * (p[0] - o[0]) + (p[1] - o[1]) * (p[1] - o[1]);
        const push = r2 > 0 ? 2 / ((0.001 + r2) * (r2 + 1)) : 0;
        for (let k = 0; k < 2; k++) p[k] += (push > 0 ? clip(push * (p[k] - o[k])) : 4) * alpha;
      }
      nextNegative[e] += negatives * everyNegative[e];
    });
  }
  return points;
}

// Words that say nothing about what a skill is for: English, and how skills describe themselves.
const STOP = new Set(`a about above after again against all also an and any are as at be because been before being below
between both but by can could did do does doing down during each either etc few for from further had has have having here
how however if in into is it its itself just may might more most must no nor not now of off on once only or other our out
over own same should so some such than that the their them then there these they this those through to too under until up
upon very via was we were what when where whether which while who whom why will with within without would you your
e g eg ie i.e use used uses using user users ask asks asked asking skill skills need needs needed want wants like make
makes making run runs running work works working one two new get gets set sets help helps instead always never every
based specific given related relevant e.g`.split(/\s+/));

/** The words of a text that may name its topic: letters and digits, three or more, lowercased, not stop words. */
export function topicWords(text) {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word)))];
}

/**
 * Each topic's label: its two most telling words, c-TF-IDF over skills: in how many of the topic's
 * skills a word is, against how common it is in every topic. A label another topic has gets a third word.
 */
export function topicLabels(texts, membership) {
  const topics = Math.max(-1, ...membership) + 1;
  const counts = Array.from({ length: topics }, () => new Map());
  const sizes = new Array(topics).fill(0);
  const everywhere = new Map();
  texts.forEach((text, i) => {
    sizes[membership[i]]++;
    for (const word of topicWords(text)) {
      counts[membership[i]].set(word, (counts[membership[i]].get(word) ?? 0) + 1);
      everywhere.set(word, (everywhere.get(word) ?? 0) + 1);
    }
  });
  const average = texts.length / Math.max(1, topics);
  const ranked = counts.map((words, topic) =>
    [...words]
      .map(([word, count]) => ({ word, score: (count / sizes[topic]) * Math.log(1 + average / everywhere.get(word)) }))
      .sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1))
      .map(({ word }) => word),
  );
  const labels = ranked.map((words) => words.slice(0, 2).join(' · ') || 'other');
  ranked.forEach((words, topic) => {
    if (labels.indexOf(labels[topic]) !== topic && words.length > 2) labels[topic] = words.slice(0, 3).join(' · ');
  });
  return labels;
}

/**
 * The map of `skills`, given their vectors in the same order: a point per skill with its topic,
 * the topics largest first with their label and middle, and each skill's most similar others.
 */
export function buildMap(skills, vectors, { seed = 42 } = {}) {
  const neighbours = nearest(vectors, Math.min(NEIGHBOURS, skills.length - 1));
  const edges = fuzzyGraph(neighbours);
  const found = communities(skills.length, edges);
  // Topics in order of size, then of their first skill: topic 0 is the largest.
  const order = [...new Set(found)]
    .map((value) => ({ value, size: found.filter((other) => other === value).length, first: found.indexOf(value) }))
    .sort((a, b) => b.size - a.size || a.first - b.first)
    .map(({ value }) => value);
  const membership = found.map((value) => order.indexOf(value));
  const labels = topicLabels(skills.map(skillText), membership);
  const positions = layout(vectors, edges, { seed });
  const points = skills.map((skill, i) => ({ id: skill.id, x: positions[i][0], y: positions[i][1], topic: membership[i] }));
  const topics = labels.map((label, topic) => {
    const members = points.filter((point) => point.topic === topic);
    const middle = (axis) => members.reduce((sum, point) => sum + point[axis], 0) / members.length;
    return { label, size: members.length, x: middle('x'), y: middle('y') };
  });
  const similar = new Map(skills.map((skill, i) => [skill.id, neighbours[i].slice(0, SIMILAR).map(({ index, distance }) => ({ id: skills[index].id, similarity: 1 - distance }))]));
  return { points, topics, similar };
}
