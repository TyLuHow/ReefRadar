import { test, expect, type Page } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * Hover probe for the unlayered legacy `.glass-panel` against variant utilities (plan 04-01).
 *
 * Under Tailwind 3 a `hover:` utility (specificity 0,2,0) beat `.glass-panel` (0,1,0). Under Tailwind 4
 * utilities live in a cascade layer and an unlayered rule beats any layer, so a hover utility on a
 * `.glass-panel` can silently stop working. Screenshots never hover, so this spec does.
 *
 * Expected values were measured on the Tailwind 3.4 build of this tree (the commit before the migration),
 * with the same spec, and are asserted as the exact computed strings.
 */

const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function blockMapTiles(page: Page) {
  await page.route(/tile\.openstreetmap\.org|cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG })
  );
}

test.describe('legacy hover states keep their Tailwind 3 values', () => {
  test('SiteCard on /sites/ keeps its resting border on hover', async ({ page }) => {
    await mockApi(page);
    await blockMapTiles(page);
    await page.goto('/sites/', { waitUntil: 'load' });

    const card = page.locator('.glass-panel', { has: page.locator('h3') }).first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    // Source: fp-before/sites-hover-1440.json (raw), the Tailwind 3 build. hover:border-opacity-50 is a no-op
    // in both versions, and the inline borderColor is var(--glass-border).
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor))
      .toBe('rgba(229, 225, 219, 0.1)');
  });

  test('SampleCard on / brightens its border on hover', async ({ page }) => {
    await mockApi(page);
    await blockMapTiles(page);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading samples...'), undefined, {
      timeout: 30_000,
    });

    // SampleCard is a GlassPanel with hover:border-(--glass-border-bright)!, measured on the Tailwind 3 build
    // as --glass-border-bright. Without the important marker the unlayered .glass-panel border would win.
    const card = page.locator('.glass-panel.w-72').first();
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgba(229, 225, 219, 0.1)');
    await card.hover();
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor))
      .toBe('rgba(229, 225, 219, 0.2)');
  });
});
