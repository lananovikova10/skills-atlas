// The standalone page's entry: the scan moves into the page, then the page itself starts.
import { standaloneFetch } from './standalone.ts';

const live = globalThis.fetch.bind(globalThis);
globalThis.fetch = standaloneFetch((url, init) => live(url, init)) as typeof fetch;
await import('../web/app.js');
