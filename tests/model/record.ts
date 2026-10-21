// Records the tests' model: potion-base-8M cut down to the tokens of the texts the tests embed, the
// skills of ./fixture and of the browser tests' recording, and reference.json's. WordPiece takes the
// longest piece it has, so a vocabulary that keeps every piece these texts use splits them the same:
// their vectors are the full model's, from under 400 KB instead of 30 MB. Needs the network; run it again
// only when those texts change.
//   node tests/model/record.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeScan } from '../../src/core/facets.ts';
import { scan } from '../../src/core/scan.ts';
import { createModel, MODEL, readSafetensors } from '../../web/embed.js';
import { skillText } from '../../web/map.js';
import { DEMO_REPOSITORY, openRecorded } from '../browser/recording.ts';
import { FIXTURE, open } from '../helpers.ts';

export const MODEL_DIRECTORY = new URL('./', import.meta.url);

const download = async (file: string) => {
  const response = await fetch(`${MODEL}${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response;
};
const vocabText = await (await download('vocab.txt')).text();
const matrix = await (await download('model.safetensors')).arrayBuffer();
const full = createModel(vocabText, matrix);

const skills = async (input: string, opener: (input: string) => ReturnType<typeof open>) => describeScan(await scan(await opener(input))).skills;
const reference = JSON.parse(readFileSync(new URL('reference.json', MODEL_DIRECTORY), 'utf8')) as { cases: { text: string }[] };
const texts = [
  ...(await skills(FIXTURE, open)).map(skillText),
  ...(await skills(DEMO_REPOSITORY, openRecorded())).map(skillText),
  ...reference.cases.map(({ text }) => text),
];

const tokens = vocabText.split('\n');
const used = new Set([tokens.indexOf('[UNK]'), ...texts.flatMap((text) => full.tokenize(text))]);
const ids = [...used].sort((a, b) => a - b);
const { dim, data } = readSafetensors(matrix);
const rows = new Float32Array(ids.length * dim);
ids.forEach((id, row) => rows.set(data.subarray(id * dim, (id + 1) * dim), row * dim));

// safetensors: the header's length, the header, padded with spaces to 8 bytes, then the data.
let header = JSON.stringify({ embeddings: { dtype: 'F32', shape: [ids.length, dim], data_offsets: [0, rows.byteLength] } });
header += ' '.repeat((8 - (header.length % 8)) % 8);
const file = new Uint8Array(8 + header.length + rows.byteLength);
new DataView(file.buffer).setBigUint64(0, BigInt(header.length), true);
file.set(new TextEncoder().encode(header), 8);
file.set(new Uint8Array(rows.buffer), 8 + header.length);

writeFileSync(fileURLToPath(new URL('vocab.txt', MODEL_DIRECTORY)), `${ids.map((id) => tokens[id]).join('\n')}\n`);
writeFileSync(fileURLToPath(new URL('model.safetensors', MODEL_DIRECTORY)), file);
console.log(`${texts.length} texts: ${ids.length} of ${tokens.length} tokens, ${file.byteLength} bytes`);
