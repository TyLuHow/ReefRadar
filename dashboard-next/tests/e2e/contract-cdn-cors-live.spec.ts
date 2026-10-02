import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * Live CDN CORS spec (plan 02-13). Runs only through playwright.live.config.ts
 * (the -live suffix keeps it out of the mocked e2e project and out of CI):
 *
 *   npm --prefix dashboard-next run test:live -- tests/e2e/contract-cdn-cors-live.spec.ts
 *
 * What it proves: a real headless Chromium page on a non-CloudFront origin
 * (http://localhost:3999) can read the live contract (latest.json, the manifest
 * and the sites artifact) from the CDN with fetch cache modes default, no-cache,
 * reload and no-store, which are the requests Chrome decorates with Priority and
 * Cache-Control/Pragma headers. Before the custom response headers policy, the
 * CDN answered those requests without Access-Control-Allow-Origin and the browser
 * blocked them.
 *
 * It only reads public CDN objects and installs no mocks for the CDN: the page
 * origin is served by a route handler on localhost:3999, and every request to the
 * CDN goes to the network unrouted.
 */

const PAGE_ORIGIN = 'http://localhost:3999';
const EXPECTED_SITE_COUNT = 54;
const CACHE_MODES = ['default', 'no-cache', 'reload', 'no-store'] as const;

// Playwright loads this spec as CommonJS, so __dirname is the spec's own directory.
const resources = JSON.parse(
  readFileSync(resolve(__dirname, '../../../infrastructure/resources.json'), 'utf-8'),
) as { cloudfront: { distributions: { contract: { domain_name: string } } } };
const CDN_HOST = resources.cloudfront.distributions.contract.domain_name;
const CDN = `https://${CDN_HOST}/`;

async function openProbePage(page: Page): Promise<void> {
  // Only the page origin is routed; requests to the CDN are never intercepted.
  await page.route(`${PAGE_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>cors probe</title><p>cors probe</p>',
    }),
  );
  await page.goto(`${PAGE_ORIGIN}/cors-probe`);
}

interface Fetched {
  status: number;
  type: string;
  text: string;
}

async function crossOriginFetch(
  page: Page,
  url: string,
  cache: (typeof CACHE_MODES)[number],
): Promise<Fetched> {
  return page.evaluate(
    async ({ target, mode }) => {
      const response = await fetch(target, { credentials: 'omit', cache: mode });
      return { status: response.status, type: response.type, text: await response.text() };
    },
    { target: url, mode: cache },
  );
}

test('pointer, manifest and sites are readable cross-origin', async ({ page }) => {
  const cdnRequests: Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).host === CDN_HOST) cdnRequests.push(request);
  });
  await openProbePage(page);

  for (const cache of CACHE_MODES) {
    const pointerResponse = await crossOriginFetch(page, `${CDN}contract/latest.json`, cache);
    expect(pointerResponse.status, `pointer (${cache})`).toBe(200);
    expect(pointerResponse.type, `pointer type (${cache})`).toBe('cors');
    const pointer = JSON.parse(pointerResponse.text) as { contract_version: number };
    expect(pointer.contract_version).toBe(1);

    const manifestResponse = await crossOriginFetch(
      page,
      `${CDN}contract/v${pointer.contract_version}.json`,
      cache,
    );
    expect(manifestResponse.status, `manifest (${cache})`).toBe(200);
    expect(manifestResponse.type, `manifest type (${cache})`).toBe('cors');
    const manifest = JSON.parse(manifestResponse.text) as {
      contract_version: number;
      artifacts: { sites: { uri: string } };
    };
    expect(manifest.contract_version).toBe(pointer.contract_version);

    const sitesResponse = await crossOriginFetch(page, `${CDN}${manifest.artifacts.sites.uri}`, cache);
    expect(sitesResponse.status, `sites (${cache})`).toBe(200);
    expect(sitesResponse.type, `sites type (${cache})`).toBe('cors');
    const sites = JSON.parse(sitesResponse.text) as { sites: unknown[] };
    expect(sites.sites).toHaveLength(EXPECTED_SITE_COUNT);
  }

  expect(cdnRequests.length).toBeGreaterThanOrEqual(CACHE_MODES.length * 3);
  for (const request of cdnRequests) {
    const headers = await request.allHeaders();
    expect(headers['origin']).toBe(PAGE_ORIGIN);
  }
});

test('author header forces a preflight that the CDN answers', async ({ page }) => {
  await openProbePage(page);

  const status = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      credentials: 'omit',
      headers: { 'X-Reefradar-Probe': '1' },
    });
    return response.status;
  }, `${CDN}contract/latest.json`);

  expect(status).toBe(200);
});
