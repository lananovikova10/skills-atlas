// The same fonts on every machine: the page asks for Roboto and Roboto Mono, which few machines have,
// so it falls back to whatever each one has. The tests serve both from @fontsource instead, and
// wait for them before the page is shown: no fallback, no swap.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test as base, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const FONTS: Record<string, string> = {
  roboto: dirname(require.resolve('@fontsource/roboto/package.json')),
  'roboto-mono': dirname(require.resolve('@fontsource/roboto-mono/package.json')),
};
/** The faces the page uses: Roboto 400 and 500, Roboto Mono 400. */
const STYLESHEETS = ['roboto/400.css', 'roboto/500.css', 'roboto-mono/400.css'];
const FACES = ['400 14px Roboto', '500 14px Roboto', '400 13px "Roboto Mono"'];

async function serveFonts(page: Page) {
  await page.route('**/__fonts/**', async (route) => {
    const [, family, ...rest] = new URL(route.request().url()).pathname.split('/').slice(1);
    const file = join(FONTS[family], ...rest);
    const body = await readFile(file);
    if (!file.endsWith('.css')) return route.fulfill({ body, contentType: file.endsWith('.woff2') ? 'font/woff2' : 'font/woff' });
    // `block`, not `swap`: the text never shows in a fallback first.
    route.fulfill({ body: String(body).replaceAll('font-display: swap', 'font-display: block'), contentType: 'text/css' });
  });
  await page.route('**/style.css', async (route) => {
    const response = await route.fetch();
    const imports = STYLESHEETS.map((sheet) => `@import url('/__fonts/${sheet}');`).join('\n');
    route.fulfill({ response, body: `${imports}\n${await response.text()}` });
  });
}

/** Opens the page with the fonts loaded, at the start of the recording. */
export async function openPage(page: Page, path = '/') {
  await page.goto(path);
  await page.evaluate((faces) => Promise.all(faces.map((face) => document.fonts.load(face))), FACES);
  await page.evaluate(() => document.fonts.ready);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await serveFonts(page);
    await use(page);
  },
});
export { expect } from '@playwright/test';
