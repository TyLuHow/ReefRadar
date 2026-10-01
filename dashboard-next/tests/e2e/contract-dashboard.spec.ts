import { test, expect } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * 02-07 tracer evidence: /dashboard renders its counts from the data contract
 * (served from contracts/ on disk by mockContract), through the verified
 * module, with no request to the legacy /sites API for that data.
 */
test.describe('/dashboard reads the contract', () => {
  test('shows 54 reference sites from latest -> manifest -> sites', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (/execute-api\.[a-z0-9-]+\.amazonaws\.com\/prod\/sites/.test(request.url())) apiCalls.push(request.url());
    });
    const contract = await mockApi(page);

    await page.goto('/dashboard/', { waitUntil: 'load' });

    // The sentence is derived from the contract's sites (deriveSiteStats); the animated stat
    // counters are deliberately not asserted (see deferred-items.md: they render 0 today).
    await expect(page.getByText('Browse 54 reference sites across 7 countries')).toBeVisible({ timeout: 15000 });
    const referenceSitesStat = page.locator('p', { hasText: /^Reference Sites$/ }).locator('xpath=preceding-sibling::div[1]');
    await expect(referenceSitesStat).not.toHaveText('—');

    expect(contract.requests).toEqual(['contract/latest.json', 'contract/v1.json', 'v1/sites.json']);
    expect(apiCalls, 'the dashboard must not read /sites from the legacy API').toEqual([]);
  });
});
