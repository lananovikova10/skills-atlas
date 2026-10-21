// The map's tiny model: Model2Vec's static embeddings, potion-base-8M. A text's vector is the mean of
// its tokens' rows, normalised, as model2vec's `encode` does: BERT's uncased WordPiece, no special
// tokens, unknown tokens dropped. No other code: the vocabulary and the safetensors file, read here.
// DOM-free: the map view loads it, and so do the tests.

/** The model's files, pinned to a commit: 30 MB, asked for only when the map is opened. */
export const MODEL = 'https://huggingface.co/minishlab/potion-base-8M/resolve/bf8b056651a2c21b8d2565580b8569da283cab23/';
export const MODEL_FILES = ['vocab.txt', 'model.safetensors'];

const UNK = '[UNK]';
const MAX_WORD = 100;

// The CJK ideographs BERT puts spaces around, so each is a word.
const CJK = [[0x4e00, 0x9fff], [0x3400, 0x4dbf], [0x20000, 0x2a6df], [0x2a700, 0x2b73f], [0x2b740, 0x2b81f], [0x2b820, 0x2ceaf], [0xf900, 0xfaff], [0x2f800, 0x2fa1f]];
const isCjk = (code) => CJK.some(([from, to]) => code >= from && code <= to);
const isPunctuation = (char) => /[!-/:-@[-`{-~]/.test(char) || /\p{P}/u.test(char);

/** BERT's normaliser and pre-tokeniser, uncased: the words and punctuation of `text`, lowercased, without accents. */
export function words(text) {
  let clean = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 0 || code === 0xfffd || (/\p{C}/u.test(char) && !'\t\n\r'.includes(char))) continue;
    if (/\p{White_Space}/u.test(char)) clean += ' ';
    else if (isCjk(code)) clean += ` ${char} `;
    else clean += char;
  }
  clean = clean.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
  const out = [];
  for (const chunk of clean.split(/\p{White_Space}+/u)) {
    let word = '';
    for (const char of chunk) {
      if (!isPunctuation(char)) word += char;
      else {
        if (word) out.push(word);
        out.push(char);
        word = '';
      }
    }
    if (word) out.push(word);
  }
  return out;
}

/** WordPiece: the longest piece of the vocabulary first, then `##` and the longest again; a word it cannot split is unknown. */
function wordPiece(word, vocab) {
  const chars = [...word];
  if (chars.length > MAX_WORD) return [UNK];
  const pieces = [];
  for (let start = 0; start < chars.length;) {
    let end = chars.length;
    let piece;
    for (; end > start; end--) {
      const candidate = (start > 0 ? '##' : '') + chars.slice(start, end).join('');
      if (vocab.has(candidate)) {
        piece = candidate;
        break;
      }
    }
    if (!piece) return [UNK];
    pieces.push(piece);
    start = end;
  }
  return pieces;
}

/** The safetensors file's one tensor, `embeddings`: F32, one row per token of the vocabulary. */
export function readSafetensors(buffer) {
  const view = new DataView(buffer);
  const length = Number(view.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)));
  const tensor = header.embeddings;
  if (!tensor || tensor.dtype !== 'F32' || tensor.shape.length !== 2) throw new Error('The model is not an F32 embeddings matrix');
  const [from, to] = tensor.data_offsets;
  // A copy: the data need not be aligned to 4 bytes in the file.
  return { rows: tensor.shape[0], dim: tensor.shape[1], data: new Float32Array(buffer.slice(8 + length + from, 8 + length + to)) };
}

/** The model from its two files: `vocab.txt`, a token per line, and the matrix, a row per line of it. */
export function createModel(vocabText, safetensors) {
  const tokens = vocabText.split('\n');
  if (tokens.at(-1) === '') tokens.pop();
  const vocab = new Map(tokens.map((token, id) => [token, id]));
  const { rows, dim, data } = readSafetensors(safetensors);
  if (rows !== tokens.length) throw new Error(`The model has ${rows} rows for ${tokens.length} tokens`);
  const unknown = vocab.get(UNK);
  const tokenize = (text) => words(text).flatMap((word) => wordPiece(word, vocab)).map((piece) => vocab.get(piece)).filter((id) => id !== unknown);
  return {
    dim,
    tokenize,
    /** The normalised mean of the text's tokens; zeros for a text without any. */
    embed(text) {
      const vector = new Float32Array(dim);
      const ids = tokenize(text);
      for (const id of ids) for (let i = 0; i < dim; i++) vector[i] += data[id * dim + i];
      let norm = 0;
      for (let i = 0; i < dim; i++) {
        vector[i] /= ids.length || 1;
        norm += vector[i] * vector[i];
      }
      norm = Math.sqrt(norm) + 1e-32;
      for (let i = 0; i < dim; i++) vector[i] /= norm;
      return vector;
    },
  };
}

/** Downloads the model's files from `base` and reads them. */
export async function loadModel(base = MODEL, fetchFile = fetch) {
  const [vocab, matrix] = await Promise.all(MODEL_FILES.map(async (file) => {
    const response = await fetchFile(`${base}${file}`);
    if (!response.ok) throw new Error(`Could not download the model: ${file}: ${response.status} ${response.statusText}`);
    return file.endsWith('.txt') ? response.text() : response.arrayBuffer();
  }));
  return createModel(vocab, matrix);
}
