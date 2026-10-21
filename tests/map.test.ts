// The map (spec/web.md, Map): the tiny model against model2vec's own answers, then the topics, their
// labels, the layout and the similar skills, over vectors made by hand and over ./fixture's skills.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { describeScan } from '../src/core/facets.ts';
import { scan } from '../src/core/scan.ts';
import { applyFilters, facetCounts, fromHash, toHash } from '../web/atlas.js';
import { createModel, loadModel, MODEL, MODEL_FILES, readSafetensors, words } from '../web/embed.js';
import { buildMap, communities, fuzzyGraph, layout, nearest, skillText, topicColor, TOPIC_COLORS, topicLabels, topicWords } from '../web/map.js';
import { FIXTURE, open } from './helpers.ts';

const MODEL_DIRECTORY = new URL('model/', import.meta.url);
const vocabText = readFileSync(new URL('vocab.txt', MODEL_DIRECTORY), 'utf8');
const matrix = () => readFileSync(new URL('model.safetensors', MODEL_DIRECTORY)).buffer as ArrayBuffer;
const model = createModel(vocabText, matrix());
const vocab = vocabText.split('\n');
const reference = JSON.parse(readFileSync(new URL('reference.json', MODEL_DIRECTORY), 'utf8')) as {
  cases: { text: string; tokens: string[]; vector: number[] }[];
};

test('model: the tokens and vectors model2vec gives, for every case of its tokenizer', () => {
  for (const { text, tokens, vector } of reference.cases) {
    assert.deepEqual(model.tokenize(text).map((id: number) => vocab[id]), tokens, JSON.stringify(text));
    const mine = model.embed(text);
    assert.equal(mine.length, 256);
    vector.forEach((value, i) => assert.ok(Math.abs(mine[i] - value) < 1e-6, `${JSON.stringify(text)} [${i}]: ${mine[i]} ≠ ${value}`));
  }
});

test('model: BERT uncased: lowercased, accents stripped, punctuation and CJK ideographs apart, control characters gone', () => {
  assert.deepEqual(words('Héllo, Wörld!'), ['hello', ',', 'world', '!']);
  assert.deepEqual(words('中文 a+b'), ['中', '文', 'a', '+', 'b']);
  assert.deepEqual(words('a\u0000b​c\td'), ['abc', 'd']);
});

test('model: a text without a known token is a vector of zeros', () => {
  assert.deepEqual([...model.embed('')], new Array(256).fill(0));
  assert.deepEqual([...model.embed('字')], new Array(256).fill(0));
});

test('model: its files, from the pinned commit; an F32 matrix with a row per token, else an error', async () => {
  assert.match(MODEL, /^https:\/\/huggingface\.co\/minishlab\/potion-base-8M\/resolve\/bf8b056651a2c21b8d2565580b8569da283cab23\/$/);
  const asked: string[] = [];
  const loaded = await loadModel(MODEL, async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(String(url).endsWith('.txt') ? vocabText : matrix());
  });
  assert.deepEqual(asked, MODEL_FILES.map((file: string) => `${MODEL}${file}`));
  assert.deepEqual([...loaded.embed('commits')], [...model.embed('commits')]);
  await assert.rejects(loadModel(MODEL, async () => new Response('', { status: 404, statusText: 'Not Found' })), /Could not download the model: vocab.txt: 404 Not Found/);
  assert.throws(() => createModel('[UNK]\n', matrix()), /The model has \d+ rows for 1 tokens/);
  const f16 = new TextEncoder().encode(JSON.stringify({ embeddings: { dtype: 'F16', shape: [1, 2], data_offsets: [0, 4] } }));
  const file = new Uint8Array(8 + f16.length + 4);
  new DataView(file.buffer).setBigUint64(0, BigInt(f16.length), true);
  file.set(f16, 8);
  assert.throws(() => readSafetensors(file.buffer), /not an F32 embeddings matrix/);
});

/** Unit vectors at the given angles, in degrees: their cosine distances are known. */
const at = (...degrees: number[]) => degrees.map((d) => Float32Array.of(Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)));

test('neighbours: the nearest others by cosine, nearest first, ties by order', () => {
  const found = nearest(at(0, 10, 20, 180), 2);
  assert.deepEqual(found.map((list: { index: number }[]) => list.map(({ index }) => index)), [[1, 2], [0, 2], [1, 0], [2, 1]]);
  assert.ok(Math.abs(found[0][0].distance - (1 - Math.cos(Math.PI / 18))) < 1e-6);
  // From 90°, 0° and 180° are as far: the first wins.
  assert.deepEqual(nearest(at(90, 0, 180), 1)[0].map(({ index }: { index: number }) => index), [1]);
});

/** Two groups of skills far apart: 0–4 near 0°, 5–9 near 120°. */
const groups = at(0, 2, 4, 6, 8, 120, 122, 124, 126, 128);

test('topics: Louvain finds the groups; largest first; nothing linked is a topic of its own', () => {
  const edges = fuzzyGraph(nearest(groups, 4));
  assert.ok(edges.every(([a, b, weight]: number[]) => a < b && weight > 0 && weight <= 1));
  const found = communities(groups.length, edges);
  assert.deepEqual(found, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual(communities(3, []), [0, 1, 2]);
  // Two cliques and a bridge: the bridge does not merge them.
  const clique = (from: number) => [[from, from + 1, 1], [from, from + 2, 1], [from + 1, from + 2, 1]];
  assert.deepEqual(communities(6, [...clique(0), ...clique(3), [2, 3, 0.1]]), [0, 0, 0, 1, 1, 1]);
});

test('labels: the words most of a topic has and the others do not; no stop words; a taken label gets a third word', () => {
  assert.deepEqual(topicWords('Use when the user asks to run Kotlin tests, 2 of 100'), ['kotlin', 'tests']);
  const texts = ['kotlin compose preview', 'kotlin compose ui', 'kotlin compose', 'python typing stubs', 'python typing'];
  assert.deepEqual(topicLabels(texts, [0, 0, 0, 1, 1]), ['compose · kotlin', 'python · typing']);
  // Four skills each, all with alpha and beta, each with a word of its own: both topics are alpha · beta.
  const shared = ['xaa', 'xbb', 'xcc', 'xdd', 'yaa', 'ybb', 'ycc', 'ydd'].map((word) => `alpha beta ${word}`);
  assert.deepEqual(topicLabels(shared, [0, 0, 0, 0, 1, 1, 1, 1]), ['alpha · beta', 'alpha · beta · yaa']);
  assert.deepEqual(topicLabels(['use it'], [0]), ['other']);
});

test('layout: the same vectors give the same map; groups apart, within a group near', () => {
  const edges = fuzzyGraph(nearest(groups, 4));
  const points = layout(groups, edges);
  assert.deepEqual(layout(groups, edges), points);
  assert.notDeepEqual(layout(groups, edges, { seed: 7 }), points);
  const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const within = Math.max(distance(points[0], points[4]), distance(points[5], points[9]));
  assert.ok(distance(points[0], points[5]) > within, `${distance(points[0], points[5])} ≤ ${within}`);
  assert.deepEqual(layout([], []), []);
  assert.deepEqual(layout(at(0), []), [[0, 0]]);
});

test('colors: eight topics have a hue in each mode, the rest none (gray)', () => {
  assert.equal(TOPIC_COLORS.light.length, 8);
  assert.equal(TOPIC_COLORS.dark.length, 8);
  assert.equal(topicColor(0, false), '#2a78d6');
  assert.equal(topicColor(0, true), '#3987e5');
  assert.equal(topicColor(8, true), undefined);
});

const fixture = async () => describeScan(await scan(await open(FIXTURE))).skills;

test('map: ./fixture by the tiny model: a point per skill, topics with labels and middles, the 5 most similar', async () => {
  const skills = await fixture();
  const map = buildMap(skills, skills.map((skill: { name: string; description: string }) => model.embed(skillText(skill))));
  assert.deepEqual(map.points.map(({ id }: { id: string }) => id), skills.map(({ id }: { id: string }) => id));
  assert.equal(map.topics.reduce((sum: number, { size }: { size: number }) => sum + size, 0), skills.length);
  assert.deepEqual(map.topics.map(({ size }: { size: number }) => size), [...map.topics.map(({ size }: { size: number }) => size)].sort((a, b) => b - a));
  for (const topic of map.topics) assert.match(topic.label, /^[\p{L}\p{N}]+( · [\p{L}\p{N}]+){0,2}$/u);
  for (const skill of skills) {
    const similar = map.similar.get(skill.id);
    assert.equal(similar.length, Math.min(5, skills.length - 1));
    assert.ok(similar.every(({ id }: { id: string }) => id !== skill.id));
    assert.deepEqual(similar.map(({ similarity }: { similarity: number }) => similarity), [...similar.map(({ similarity }: { similarity: number }) => similarity)].sort((a, b) => b - a));
  }
  // The same skills, the same map.
  assert.deepEqual(buildMap(skills, skills.map((skill: { name: string; description: string }) => model.embed(skillText(skill)))), map);
});

test('map: no skill, or one', () => {
  assert.deepEqual(buildMap([], []), { points: [], topics: [], similar: new Map() });
  const one = buildMap([{ id: 'a', name: 'commits', description: 'Write commits' }], [model.embed('commits')]);
  assert.deepEqual(one.points, [{ id: 'a', x: 0, y: 0, topic: 0 }]);
  assert.deepEqual(one.topics, [{ label: 'commits · write', size: 1, x: 0, y: 0 }]);
  assert.deepEqual(one.similar.get('a'), []);
});

test('topic filter: a facet once skills have a topic; OR within, AND across; in the hash', async () => {
  const skills = (await fixture()).map((skill, i) => ({ ...skill, topic: i < 2 ? 'review · code' : 'commits · release' }));
  const filters = { ...fromHash('').filters, topic: ['review · code'] };
  const counts = (skills: object[], filters: object) => facetCounts(skills, filters) as Record<string, { value: string; count: number }[]>;
  assert.deepEqual((applyFilters(skills, filters) as typeof skills).map(({ name }) => name), skills.slice(0, 2).map(({ name }) => name));
  assert.deepEqual(counts(skills, filters).topic, [{ value: 'commits · release', count: 3 }, { value: 'review · code', count: 2 }]);
  assert.deepEqual(counts(await fixture(), fromHash('').filters).topic, []);
  const state = { repo: 'x', view: 'map', sort: 'name', filters };
  assert.equal(toHash(state), 'repo=x&view=map&topic=review+%C2%B7+code');
  assert.deepEqual(fromHash(toHash(state)), state);
});
