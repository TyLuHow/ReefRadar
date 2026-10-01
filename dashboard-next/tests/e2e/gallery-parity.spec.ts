import { test, expect, type Page } from '@playwright/test';

/**
 * Gallery parity spec (plan 01-07, D-02).
 *
 * Proves the locally-built-from-git landing page gallery is DOM-equivalent to
 * the deployed production app. Both pages call the same live `/samples`
 * endpoint (no API mocking) — this is a parity check, not a fixture replay.
 *
 * Runs under the local `e2e` Playwright project (playwright.config.ts), which
 * starts `npm run build && npm run start -- -p 3100` and serves "/" from
 * that local build. The production page is opened in a second browser
 * context against the live deployment.
 */
const PROD_URL = process.env.PW_LIVE_BASE_URL || 'https://dashboard-next-indol-nu.vercel.app';

async function waitForGalleryLoaded(page: Page) {
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Loading samples...'),
    undefined,
    { timeout: 30_000 }
  );
}

async function collectGalleryState(page: Page) {
  const headings = await page.locator('main section > div.mb-6 > h2').allTextContents();
  const subtitles = await page.locator('main section > div.mb-6 > p').allTextContents();
  const cardNames = await page.locator('main section h3').allTextContents();
  const analyzeCount = await page.locator('main a:has-text("Analyze This")').count();
  return {
    headings: headings.map((h) => h.trim()),
    subtitles: subtitles.map((s) => s.trim()),
    cardNames: cardNames.map((c) => c.trim()),
    analyzeCount,
  };
}

test('landing gallery is DOM-equivalent to production', async ({ browser }) => {
  const localContext = await browser.newContext();
  const localPage = await localContext.newPage();
  await localPage.goto('/');
  await waitForGalleryLoaded(localPage);

  const prodContext = await browser.newContext();
  const prodPage = await prodContext.newPage();
  await prodPage.goto(PROD_URL);
  await waitForGalleryLoaded(prodPage);

  const local = await collectGalleryState(localPage);
  const prod = await collectGalleryState(prodPage);

  // Sanity: the gallery actually rendered something on both sides.
  expect(local.headings.length).toBeGreaterThan(0);
  expect(local.analyzeCount).toBeGreaterThan(0);

  expect(local.headings).toEqual(prod.headings);
  expect(local.subtitles).toEqual(prod.subtitles);
  expect(local.cardNames).toEqual(prod.cardNames);
  expect(local.analyzeCount).toEqual(prod.analyzeCount);

  await localContext.close();
  await prodContext.close();
});
