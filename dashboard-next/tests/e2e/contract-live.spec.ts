import { test, expect, type Page, type Response } from '@playwright/test';

/**
 * Live contract spec (Phase 2 exit, plan 02-12). Runs only through
 * playwright.live.config.ts (the -live suffix keeps it out of the mocked e2e
 * project and out of CI) against a production build that uses the default
 * contract base URL, i.e. NO NEXT_PUBLIC_CONTRACT_BASE_URL override:
 *
 *   npm run build
 *   npm run start -- -p 3200
 *   PW_LIVE_BASE_URL=http://localhost:3200 npx playwright test \
 *     -c playwright.live.config.ts tests/e2e/contract-live.spec.ts
 *
 * It installs no API or contract mocks. It records every request and response
 * the real browser makes and asserts what Phase 2 promises: the web app reads
 * its reference data from the live, immutable CloudFront contract over CORS,
 * follows latest.json when unpinned, pins exactly the version in ?cv=, reports
 * a missing version instead of substituting another, and never asks the
 * backend /sites route for site data.
 *
 * Only public CDN objects are read; nothing is deployed or written.
 */

const CDN_HOST = 'd7dr1fzple2sg.cloudfront.net';
const EXPECTED_SITE_COUNT = 54;

interface Recorder {
  requests: string[];
  responses: Response[];
}

function record(page: Page): Recorder {
  const recorder: Recorder = { requests: [], responses: [] };
  page.on('request', (request) => recorder.requests.push(request.url()));
  page.on('response', (response) => recorder.responses.push(response));
  return recorder;
}

function cdnPaths(urls: string[]): string[] {
  return urls
    .map((url) => new URL(url))
    .filter((url) => url.host === CDN_HOST)
    .map((url) => url.pathname);
}

function backendSitesRequests(urls: string[]): string[] {
  return urls.filter((raw) => {
    const url = new URL(raw);
    return url.host.includes('execute-api') && url.pathname.replace(/\/+$/, '').endsWith('/sites');
  });
}

function cdnResponse(recorder: Recorder, path: string): Response | undefined {
  return recorder.responses.find((r) => {
    const url = new URL(r.url());
    return url.host === CDN_HOST && url.pathname === path;
  });
}

const siteCards = (page: Page) => page.locator('div[id^="site-"]');

test('unpinned: /sites/ renders all 54 sites from the live contract over CORS, with no backend /sites call', async ({ page }) => {
  const recorder = record(page);
  await page.goto('/sites/');

  await expect(siteCards(page)).toHaveCount(EXPECTED_SITE_COUNT, { timeout: 45_000 });

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-contract-version', '1');
  await expect(html).toHaveAttribute('data-contract-pinned', 'false');

  for (const path of ['/contract/latest.json', '/contract/v1.json', '/v1/sites.json']) {
    const response = cdnResponse(recorder, path);
    expect(response, `no response recorded for ${path}`).toBeDefined();
    expect(response!.status(), `${path} status`).toBe(200);
    expect(response!.headers()['access-control-allow-origin'], `${path} CORS`).toBe('*');
  }

  expect(backendSitesRequests(recorder.requests)).toEqual([]);
});

test('pinned: /sites/?cv=1 marks the document pinned and never requests latest.json', async ({ page }) => {
  const recorder = record(page);
  await page.goto('/sites/?cv=1');

  await expect(siteCards(page)).toHaveCount(EXPECTED_SITE_COUNT, { timeout: 45_000 });

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-contract-version', '1');
  await expect(html).toHaveAttribute('data-contract-pinned', 'true');

  const paths = cdnPaths(recorder.requests);
  expect(paths).toContain('/contract/v1.json');
  expect(paths.filter((p) => p.endsWith('/contract/latest.json'))).toEqual([]);
  expect(backendSitesRequests(recorder.requests)).toEqual([]);
});

test('missing version: /sites/?cv=999999 shows the not-found alert, no latest.json, no substitution', async ({ page }) => {
  const recorder = record(page);
  await page.goto('/sites/?cv=999999');

  const alert = page.getByRole('alert').filter({ hasText: 'was not found' });
  await expect(alert).toBeVisible({ timeout: 45_000 });
  await expect(alert).toContainText('999999');

  await expect(page.locator('html')).toHaveAttribute('data-contract-pinned', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-contract-version', /.+/);
  await expect(siteCards(page)).toHaveCount(0);

  const paths = cdnPaths(recorder.requests);
  expect(paths.filter((p) => p.endsWith('/contract/latest.json'))).toEqual([]);
});
