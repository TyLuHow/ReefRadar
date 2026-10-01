import { test, expect } from '@playwright/test';

/**
 * Preview truth spec (Phase 1 exit, plan 01-20). Runs through
 * playwright.live.config.ts against a deployed or locally served build:
 *
 *   PW_LIVE_BASE_URL=<preview url> npx playwright test \
 *     -c playwright.live.config.ts tests/e2e/preview-truth-live.spec.ts
 *
 * If the preview sits behind Vercel Deployment Protection, supply the
 * project's "Protection Bypass for Automation" secret via
 * PW_VERCEL_BYPASS_SECRET (never commit or print it).
 *
 * It asserts what Phase 1 promises a visitor: real, attributed audio that
 * actually plays, dataset labels with who assigned them, the canonical MARRS
 * DOI, and an honest "Unknown" status for sites whose upstream dataset has no
 * health label (Bora-Bora).
 */

const bypass = process.env.PW_VERCEL_BYPASS_SECRET;
if (bypass) {
  test.use({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    },
  });
}

const MARRS_DOI = '10.5522/04/29958062';

test('landing: first story card shows who assigned the label and plays real audio', async ({ page }) => {
  await page.goto('/');

  const badge = page.getByText(/assigned by MARRS/).first();
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await expect(badge).toContainText('Reference label:');

  // The card that owns the first badge: its play button requests its audio.
  const card = page.locator('.glass-panel', { has: badge }).last();
  const audioResponse = page.waitForResponse(
    (r) => /\.(wav|mp3|ogg|flac)(\?|$)/i.test(r.url()),
    { timeout: 30_000 },
  );
  await card.getByRole('button', { name: 'Play' }).click();
  const response = await audioResponse;
  expect([200, 206]).toContain(response.status());
  expect(response.headers()['content-type'] ?? '').toMatch(/audio|octet-stream|wav/i);
});

test('about: canonical MARRS DOI is shown', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByText(MARRS_DOI).first()).toBeVisible();
});

test('sites: a Bora-Bora card has status Unknown and its original dataset label', async ({ page }) => {
  await page.goto('/sites/');

  const card = page.locator('.glass-panel', { has: page.locator('h3', { hasText: /^borabora_tourist$/ }) }).last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText('Unknown', { exact: true }).first()).toBeVisible();

  await card.getByRole('button', { name: /More details/ }).click();
  await expect(card).toContainText('Label: tourist');
  await expect(card).toContainText('assigned by');
});
