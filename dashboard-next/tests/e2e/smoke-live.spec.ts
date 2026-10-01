import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke test against the live deployed app (playwright.live.config.ts).
 *
 * Verifies the page renders and that an axe accessibility scan can run
 * end to end. This does NOT assert zero violations — the legacy app is
 * not expected to be clean; later plans in this phase fix specific
 * accessibility/copy issues. This test only proves the Playwright + axe
 * pipeline works against the live deployment.
 */
test('about page loads and axe scan runs', async ({ page }) => {
  await page.goto('/about/');

  const heading = page.locator('h1').first();
  await expect(heading).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(Array.isArray(results.violations)).toBe(true);
});
