import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';
import { STATES } from './support/states';

/**
 * Route smoke suite (01-08, D-22).
 *
 * Exercises legacy routes against a local `next start` with the API fully
 * mocked by committed fixtures — never the live API. Fails on any
 * uncaught page error or same-origin HTTP response >= 400.
 *
 * Task 1 (tracer): about state only, proving the pipeline locally and in
 * CI before Task 2 expands this to all 11 baseline states.
 */

async function assertCleanLoad(page: Page, statePath: string) {
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url() || 'http://localhost:3100').origin) return;
    if (response.status() < 400) return;
    badResponses.push(`${response.status()} ${url.pathname}`);
  });

  await page.goto(statePath, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  expect(pageErrors, `uncaught page errors on ${statePath}`).toEqual([]);
  expect(badResponses, `unexpected >=400 same-origin responses on ${statePath}`).toEqual([]);
}

const aboutState = STATES.find((s) => s.name === 'about')!;

test('about loads cleanly', async ({ page }) => {
  await mockApi(page);
  await assertCleanLoad(page, aboutState.path);
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible({ timeout: 15000 });
});
