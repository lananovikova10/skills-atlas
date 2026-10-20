// A template for recording a web page with Playwright: copy it, then replace the scenario.
// Usage: node browser-scenario.mjs <url> <out-dir>
// Run from a directory where `playwright` is installed.
import { chromium } from 'playwright';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('Usage: node browser-scenario.mjs <url> <out-dir>');
  process.exit(1);
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = ms => page.waitForTimeout(ms);
// Visible typing: a viewer can follow it
const type = (selector, text) => page.locator(selector).pressSequentially(text, { delay: 140 });

await page.goto(url);
await pause(800);

// --- The scenario: Skill Atlas's live search, as an example ---
await page.locator('#repo').pressSequentially('https://github.com/JetBrains/intellij-community', { delay: 35 });
await page.click('#analyse');
// Wait for the real result, not a fixed time
await page.locator('.skill-grid > *').first().waitFor({ timeout: 120000 });
await pause(2000);
await page.keyboard.press('/');
await type('#search', 'release');
await pause(2500);
await page.locator('.chip', { hasText: 'Tool-restricted' }).click();
await pause(2500);
await page.click('#clear-filters');
await pause(1500);
// --- End of the scenario ---

await context.close();
console.log(await page.video().path());
await browser.close();
