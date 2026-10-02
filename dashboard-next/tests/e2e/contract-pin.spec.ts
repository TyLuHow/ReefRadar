import { test, expect } from '@playwright/test';
import { mockApi, mockContract, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * 02-08 (CONTRACT-04): ?cv=N resolves exactly contract vN, never latest.json, and a
 * missing or malformed version is shown to the visitor instead of being replaced by
 * the latest contract. The pointer fixture says v2 is latest throughout.
 */
test.describe('?cv pins a contract version', () => {
  test('/dashboard/?cv=1 while v2 is latest resolves v1 and never requests latest.json', async ({ page }) => {
    await mockApi(page);
    const contract = await mockContract(page, { latest: 2 });

    await page.goto('/dashboard/?cv=1', { waitUntil: 'load' });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-contract-version', '1', { timeout: 15000 });
    await expect(html).toHaveAttribute('data-contract-pinned', 'true');
    await expect(page.getByText('Browse 54 reference sites across 7 countries')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    expect(contract.requests).not.toContain('contract/latest.json');
    expect(contract.requests).toContain('contract/v1.json');
    expect(contract.requests).not.toContain('contract/v2.json');
  });

  test('?cv=N equal to the current latest is still pinned and issues no latest.json request', async ({ page }) => {
    await mockApi(page);
    const contract = await mockContract(page, { latest: 1 });

    await page.goto('/dashboard/?cv=1', { waitUntil: 'load' });

    await expect(page.locator('html')).toHaveAttribute('data-contract-version', '1', { timeout: 15000 });
    await expect(page.locator('html')).toHaveAttribute('data-contract-pinned', 'true');
    expect(contract.requests).not.toContain('contract/latest.json');
  });

  test('?cv=9 (not published) shows a visible not-found alert and does not fall back to latest', async ({ page }) => {
    await mockApi(page);
    const contract = await mockContract(page, { latest: 2 });

    await page.goto('/dashboard/?cv=9', { waitUntil: 'load' });

    await expect(page.getByRole('alert')).toContainText('contract version 9 was not found', { timeout: 15000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-contract-version', /.+/);
    expect(contract.requests).not.toContain('contract/latest.json');
    expect(contract.requests).not.toContain('contract/v2.json');
  });

  for (const [label, raw] of [
    ['non-numeric', 'abc'],
    ['empty', ''],
    ['zero', '0'],
    ['path-like', '../x'],
  ] as const) {
    test(`?cv=${label} shows a visible invalid alert and requests no contract`, async ({ page }) => {
      await mockApi(page);
      const contract = await mockContract(page, { latest: 2 });

      await page.goto(`/dashboard/?cv=${encodeURIComponent(raw)}`, { waitUntil: 'load' });

      await expect(page.getByRole('alert')).toContainText('not a valid contract version', { timeout: 15000 });
      expect(contract.requests).toEqual([]);
    });
  }

  test('/dashboard/ without cv follows latest (v2) and is not pinned', async ({ page }) => {
    await mockApi(page);
    await mockContract(page, { latest: 2 });

    await page.goto('/dashboard/', { waitUntil: 'load' });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-contract-version', '2', { timeout: 15000 });
    await expect(html).toHaveAttribute('data-contract-pinned', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
