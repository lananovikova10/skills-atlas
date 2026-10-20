// The demo docs/demo/search-filter.mp4 as a test: the steps of spec/web.md's Search and Filters, on
// JetBrains/intellij-community at the recorded commit. Each step waits for its result on the page,
// never for a time; the pauses after it are for whoever watches the video, not for the page.
import { DEMO_REPOSITORY } from './recording.ts';
import { expect, openPage, test } from './fonts.ts';

const COMMIT = '589d822';
const SKILLS = 41;

test('the bundled fonts are the ones the page renders with', async ({ page }) => {
  await openPage(page);
  const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map((face) => `${face.family} ${face.weight}`));
  expect(new Set(loaded)).toEqual(new Set(['Roboto 400', 'Roboto 500', 'Roboto Mono 400']));
  expect(await page.evaluate(() => document.fonts.check('14px Roboto') && document.fonts.check('13px "Roboto Mono"'))).toBe(true);
});

test('the demo: live search, the graph, a chip AND the search, Clear filters', async ({ page }) => {
  // About 32 s of it are the pauses, as in the video.
  test.setTimeout(60_000);
  const watch = (ms: number) => page.waitForTimeout(ms);
  const search = page.locator('#search');
  const summary = page.locator('#summary-text');
  const cards = page.locator('#list-view .skill-card');
  const names = () => cards.locator('h3');
  const typeSearch = (text: string) => search.pressSequentially(text, { delay: 140 });

  await openPage(page);
  await watch(800);

  await test.step('analyse the repository', async () => {
    await page.locator('#repo').pressSequentially(DEMO_REPOSITORY, { delay: 35 });
    await watch(400);
    await page.click('#analyse');
    await expect(page.locator('#repo-link')).toHaveText('JetBrains/intellij-community');
    await expect(summary).toHaveText(`${SKILLS} skills · ${COMMIT}`);
    await expect(cards).toHaveCount(SKILLS);
    await expect(page.locator('#show-notes')).toHaveText('0 warnings · 0 ignored');
    await watch(2000);
  });

  await test.step('`/` focuses the search; the list follows every keystroke', async () => {
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await typeSearch('kotlin');
    await expect(summary).toHaveText(`Showing 4 of ${SKILLS} skills · ${COMMIT}`);
    await expect(names()).toHaveText(['code-style', 'jna', 'kotlin-ui-dsl', 'kotlin-ui-swing-component-architecture']);
    await expect(page).toHaveURL(/q=kotlin/);
    await watch(2200);
  });

  await test.step('several words: every word must match, in any order', async () => {
    await search.fill('');
    await expect(cards).toHaveCount(SKILLS);
    await typeSearch('ui test');
    await expect(names()).toHaveText(['driver-ui-tests']);
    await watch(2500);
  });

  await test.step('nothing matches, then Clear search', async () => {
    await typeSearch('zzz');
    await expect(page.locator('#empty-text')).toHaveText('No skills match "ui testzzz"');
    await expect(cards).toHaveCount(0);
    await watch(2000);
    await page.click('#empty-clear');
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(summary).toHaveText(`${SKILLS} skills · ${COMMIT}`);
    await watch(1500);
  });

  await test.step('the graph is filtered the same way', async () => {
    await typeSearch('jewel');
    await expect(names()).toHaveText(['jewel-markdown', 'jewel-release']);
    await watch(1500);
    await page.click('[data-view="graph"]');
    await expect(page.locator('#graph-view')).toBeVisible();
    await expect(page.locator('#graph canvas').first()).toBeVisible();
    await expect(page.locator('#graph-legend')).toContainText('Claude Code');
    await expect(summary).toHaveText(`Showing 2 of ${SKILLS} skills · ${COMMIT}`);
    await expect(page).toHaveURL(/view=graph/);
    await watch(3000);
    await page.click('[data-view="list"]');
    await expect(names()).toHaveText(['jewel-markdown', 'jewel-release']);
    await watch(800);
  });

  await test.step('Esc clears the search', async () => {
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(cards).toHaveCount(SKILLS);
    await watch(1500);
  });

  await test.step('a chip AND the search; the chips count among the matches', async () => {
    const chip = page.locator('.chip', { hasText: 'Tool-restricted' });
    await expect(chip.locator('.count')).toHaveText('2');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(names()).toHaveText(['jewel-release', 'youtrack-community']);
    await watch(2500);
    await typeSearch('release');
    await expect(names()).toHaveText(['jewel-release']);
    await expect(summary).toHaveText(`Showing 1 of ${SKILLS} skills · ${COMMIT}`);
    await expect(chip.locator('.count')).toHaveText('1');
    await watch(2500);
  });

  await test.step('Clear filters clears the chips and the search', async () => {
    await page.click('#clear-filters');
    await expect(search).toHaveValue('');
    await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
    await expect(cards).toHaveCount(SKILLS);
    await expect(summary).toHaveText(`${SKILLS} skills · ${COMMIT}`);
    await watch(1500);
  });
});
