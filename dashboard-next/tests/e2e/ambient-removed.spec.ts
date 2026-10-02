import { test, expect } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * DS-07 browser proof: static pages carry no ambient canvas.
 *
 * The background particle layer and the decorative spectrogram were canvas
 * elements; with them removed, these pages render no canvas at all.
 */
const STATIC_PAGES = ['/', '/about/', '/dashboard/', '/experience/'];

test.describe('no ambient canvas', () => {
  for (const pagePath of STATIC_PAGES) {
    test(`${pagePath} renders zero canvas elements`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await mockApi(page);
      await page.goto(pagePath, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

      await expect(page.locator('canvas')).toHaveCount(0);
      expect(pageErrors, `uncaught page errors on ${pagePath}`).toEqual([]);
    });
  }
});

test.describe('static crossfader slider', () => {
  test('/experience?mode=compare shows a plain crossfader-slider that moves without errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await mockApi(page);
    await page.goto('/experience/?mode=compare', { waitUntil: 'load' });
    await expect(page.getByText('Compare Locations').first()).toBeVisible({ timeout: 15000 });

    const slider = page.locator('input[type=range].crossfader-slider');
    await expect(slider).toBeVisible();
    await slider.fill('0.8');
    await expect(slider).toHaveValue('0.8');

    const touchAction = await slider.evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');

    expect(pageErrors, 'uncaught page errors on /experience?mode=compare').toEqual([]);
  });
});
