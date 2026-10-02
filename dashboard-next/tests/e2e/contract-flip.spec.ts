import { test, expect } from '@playwright/test';
import { mockApi, mockContract, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * 02-08 (CONTRACT-03): publishing a later contract version that flips a coverage
 * flag reaches an already-open page within one 60 s pointer refetch, with no
 * reload and no rebuild. Fixtures: latest-v1 -> latest-v2, where v2 flips
 * has_diel and reuses v1's sites bytes.
 */
test.describe('latest.json flip', () => {
  test('a running /dashboard picks up v2 and has_diel without reloading', async ({ page }) => {
    await mockApi(page);
    const contract = await mockContract(page, { latest: 1 });
    await page.clock.install();

    await page.goto('/dashboard/', { waitUntil: 'load' });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-contract-version', '1', { timeout: 15000 });
    await expect(html).toHaveAttribute('data-contract-coverage', '');
    await expect(page.getByText('Browse 54 reference sites across 7 countries')).toBeVisible({ timeout: 15000 });

    // A marker that a reload or a new document would lose.
    await page.evaluate(() => {
      (window as unknown as { __flipMarker: string }).__flipMarker = 'same-document';
    });

    contract.setLatest(2);
    const v2Request = page.waitForRequest((request) => request.url().endsWith('/contract/v2.json'));
    await page.clock.fastForward(60_000);
    await v2Request;

    await expect(html).toHaveAttribute('data-contract-version', '2', { timeout: 15000 });
    await expect(html).toHaveAttribute('data-contract-coverage', /has_diel/);
    await expect(html).toHaveAttribute('data-contract-pinned', 'false');
    expect(await page.evaluate(() => (window as unknown as { __flipMarker?: string }).__flipMarker)).toBe('same-document');

    // v2 reuses v1's sites bytes: what the visitor sees does not change.
    await expect(page.getByText('Browse 54 reference sites across 7 countries')).toBeVisible();
  });
});
