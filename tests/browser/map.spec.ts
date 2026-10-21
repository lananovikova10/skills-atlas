// The demo docs/demo/skill-map.mp4 as a test: spec/web.md's Map, on JetBrains/intellij-community at
// the recorded commit. Hugging Face is answered from tests/model, the full model's rows for these
// skills' tokens, so the map is the one the real model makes. Each step waits for its result on the
// page; the pauses after it are for whoever watches the video. Then the page is compared to its screenshot.
import { readFile } from 'node:fs/promises';
import { MODEL } from '../../web/embed.js';
import { DEMO_REPOSITORY } from './recording.ts';
import { expect, openPage, test } from './fonts.ts';

const COMMIT = '589d822';
const SKILLS = 41;
const TOPICS = ['modify · modules', 'failures · debug', 'icons · api', 'build · jewel', 'commits · actions', 'python · basedpyright'];

test('the demo: the map of the skills, a topic, the search on the map, similar skills', async ({ page }) => {
  test.setTimeout(60_000);
  const asked: string[] = [];
  await page.route(`${MODEL}**`, async (route) => {
    const file = route.request().url().slice(MODEL.length);
    asked.push(file);
    route.fulfill({ body: await readFile(new URL(`../model/${file}`, import.meta.url)), headers: { 'access-control-allow-origin': '*' } });
  });
  const watch = (ms: number) => page.waitForTimeout(ms);
  const summary = page.locator('#summary-text');
  const status = page.locator('#map-status');
  const cards = page.locator('#list-view .skill-card');
  const topic = (label: string) => page.locator('#facets .chip', { hasText: label });

  await openPage(page);
  await watch(800);

  await test.step('analyse the repository: the list, and no model yet', async () => {
    await page.locator('#repo').pressSequentially(DEMO_REPOSITORY, { delay: 35 });
    await watch(400);
    await page.click('#analyse');
    await expect(summary).toHaveText(`${SKILLS} skills · ${COMMIT}`);
    await expect(cards).toHaveCount(SKILLS);
    expect(asked).toEqual([]);
    await watch(1500);
  });

  await test.step('the map: the model, then every skill placed, in topics', async () => {
    await page.click('[data-view="map"]');
    await expect(status).toHaveText(`${SKILLS} skills in ${TOPICS.length} topics, placed by what they say they do`);
    expect(asked).toEqual(['vocab.txt', 'model.safetensors']);
    await expect(page.locator('#map canvas').first()).toBeVisible();
    await expect(page.locator('#map-legend span')).toHaveText([...TOPICS, /^Near skills say similar things/]);
    await expect(page.locator('#facets .facet h3').first()).toHaveText('Topic');
    await expect(page).toHaveURL(/view=map/);
    await expect(page).toHaveScreenshot('01-map.png');
    await watch(3000);
  });

  await test.step('a topic: the other skills fade, nothing moves', async () => {
    await topic('failures · debug').click();
    await expect(topic('failures · debug')).toHaveAttribute('aria-pressed', 'true');
    await expect(topic('failures · debug').locator('.count')).toHaveText('9');
    await expect(page).toHaveURL(/topic=failures/);
    await expect(page).toHaveScreenshot('02-map-topic.png');
    await watch(2500);
  });

  await test.step('the search AND the topic, on the map and in the list', async () => {
    await page.locator('#search').pressSequentially('tests', { delay: 140 });
    await expect(summary).toHaveText(`Showing 5 of ${SKILLS} skills · ${COMMIT}`);
    await expect(page).toHaveScreenshot('03-map-topic-and-search.png');
    await watch(2500);
    await page.click('[data-view="list"]');
    await expect(cards.locator('h3')).toHaveText(['bazel-test-migration', 'conda-env-tests', 'testing', 'testing-internals', 'writing-tests']);
    await watch(2000);
  });

  await test.step("a skill's sheet: the skills most like it", async () => {
    await cards.filter({ hasText: 'writing-tests' }).click();
    await expect(page.locator('#sheet-title')).toHaveText('writing-tests');
    const similar = page.locator('#sheet-body .similar button');
    await expect(similar).toHaveText(['testing', 'driver-ui-tests', 'code-style', 'testing-internals', 'commits']);
    await page.locator('#sheet-body h4', { hasText: 'Similar skills' }).scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot('04-similar-skills.png');
    await watch(2500);
    await similar.first().click();
    await expect(page.locator('#sheet-title')).toHaveText('testing');
    await watch(2000);
    await page.click('#sheet-close');
  });

  await test.step('Clear filters: the whole map again', async () => {
    await page.click('#clear-filters');
    await page.click('[data-view="map"]');
    await expect(summary).toHaveText(`${SKILLS} skills · ${COMMIT}`);
    await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
    expect(asked).toEqual(['vocab.txt', 'model.safetensors']);
    await watch(1500);
  });
});
