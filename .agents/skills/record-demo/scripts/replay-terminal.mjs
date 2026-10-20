// Replays a run captured by stamp.mjs in xterm.js and records it as a .webm with Playwright.
// Usage: node replay-terminal.mjs <run.json> "<command as typed>" <out-dir> [cols] [rows] [maxGapMs]
// Run from a directory where `playwright` and `@xterm/xterm` are installed.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [runFile, command, outDir, cols = '150', rows = '46', maxGap = '1500'] = process.argv.slice(2);
if (!runFile || !command || !outDir) {
  console.error('Usage: node replay-terminal.mjs <run.json> "<command>" <out-dir> [cols] [rows] [maxGapMs]');
  process.exit(1);
}
// `script` echoes the ^D it gets from the closed stdin; drop it
const chunks = JSON.parse(readFileSync(runFile, 'utf8')).filter(([, d]) => !d.startsWith('^D'));

const html = resolve('term.html');
writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="node_modules/@xterm/xterm/css/xterm.css">
<style>html,body{margin:0;background:#1e1e2e;height:100%}#t{padding:16px;height:calc(100% - 32px)}</style>
</head><body><div id="t"></div>
<script src="node_modules/@xterm/xterm/lib/xterm.js"></script>
<script>
window.term = new Terminal({ cols: ${Number(cols)}, rows: ${Number(rows)}, fontSize: 13, fontFamily: 'Menlo, monospace',
  convertEol: true, theme: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc' } });
term.open(document.getElementById('t'));
</script></body></html>`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.goto('file://' + html);
const write = s => page.evaluate(s => new Promise(r => term.write(s, r)), s);
const pause = ms => page.waitForTimeout(ms);
const prompt = '\x1b[32m$\x1b[0m ';

await pause(600);
await write(prompt);
for (const c of command) { await write(c); await pause(45); }
await pause(500);
await write('\r\n');
// The real timings, with long waits capped
let last = chunks[0]?.[0] ?? 0;
for (const [t, d] of chunks) { await pause(Math.min(t - last, Number(maxGap))); last = t; await write(d); }
await write(prompt);
await pause(5000);

await context.close();
console.log(await page.video().path());
await browser.close();
