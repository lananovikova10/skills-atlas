// The real web view, with GitHub answering from the recording: Playwright starts it for the tests.
// Usage: node tests/browser/server.ts <port>
import { startServer } from '../../src/serve.ts';
import { openRecorded } from './recording.ts';

const { url } = await startServer({ open: openRecorded(), port: Number(process.argv[2] ?? 0) });
console.log(`Skill Atlas at ${url}`);
