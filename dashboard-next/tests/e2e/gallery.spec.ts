import { test, expect } from '@playwright/test';
import { mockApi } from './support/mock-api';

/**
 * Landing gallery and /experience sample view e2e (01-18, D-05/D-09/D-17,
 * TRUTH-03/04/07/09).
 *
 * Covers: the gallery via the live /samples fixture, the gallery via its
 * committed fallback (when /samples 500s), reference-label wording and
 * attribution on SampleCard, and the /experience?sample=<id> sample view
 * mirroring the same wording. All API calls are mocked (01-08, D-22); this
 * suite never reaches the live API or AWS.
 */

const STORY_TITLES = [
  'Reference reefs in three countries',
  'Healthy and degraded reefs at one location',
  'Four reef conditions at one location',
];

async function waitForGalleryLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Loading samples...'),
    undefined,
    { timeout: 30_000 }
  );
}

test.describe('landing gallery', () => {
  test('renders the manifest story titles from the live /samples fixture', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await waitForGalleryLoaded(page);

    for (const title of STORY_TITLES) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('falls back to the committed manifest-derived list when /samples 500s, and the first clip plays', async ({ page }) => {
    await mockApi(page, {
      'GET /samples': (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"SAMPLES_UNAVAILABLE","message":"unavailable"}}' }),
    });
    await page.goto('/');
    await waitForGalleryLoaded(page);

    for (const title of STORY_TITLES) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }

    const audioRequest = page.waitForRequest(/\/audio\/marrs\/.*\.wav$/);
    await page.locator('main button[aria-label="Play"]').first().click();
    const request = await audioRequest;
    const response = await request.response();
    expect([200, 206]).toContain(response?.status());
  });

  test('every card shows a reference label assigned by MARRS, an attribution line, and no frequency chips', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await waitForGalleryLoaded(page);

    const cards = page.locator('main section').first().locator('> div > div.snap-start');
    await expect(cards.first()).toBeVisible();
    const firstCardText = await cards.first().textContent();
    expect(firstCardText).toContain('Reference label:');
    expect(firstCardText).toContain('assigned by MARRS');
    expect(firstCardText).toContain('Williams & Jones 2025');

    await expect(page.locator('body')).not.toContainText('Hz)');
  });

  test('"Analyze This" navigates to /experience?sample=<id>', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await waitForGalleryLoaded(page);

    const firstAnalyzeLink = page.locator('main a:has-text("Analyze This")').first();
    const href = await firstAnalyzeLink.getAttribute('href');
    expect(href).toMatch(/^\/experience\/?\?sample=/);
  });
});

test.describe('/experience sample view', () => {
  test('shows the sample, a reference label with attribution, no chips, and plays real audio', async ({ page }) => {
    await mockApi(page);
    await page.goto('/experience?sample=aus_D1_20230208_120000');
    await expect(page.getByText('Degraded reference reef, Great Barrier Reef (aus_D1)')).toBeVisible();
    await expect(page.getByText(/Reference label:.*assigned by MARRS/)).toBeVisible();
    await expect(page.getByText(/Williams & Jones 2025/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Hz)');

    const audioRequest = page.waitForRequest(/\/audio\/marrs\/aus_D1_20230208_120000\.wav$/);
    await page.locator('button[aria-label="Play"]').click();
    const request = await audioRequest;
    const response = await request.response();
    expect([200, 206]).toContain(response?.status());
  });

  test('an old synthetic sample id shows the not-found error state, not fallback content', async ({ page }) => {
    await mockApi(page);
    await page.goto('/experience?sample=idn_healthy_dawn');
    await expect(page.getByText('Something Went Wrong')).toBeVisible();
    await expect(page.getByText(/idn_healthy_dawn.*not found/)).toBeVisible();
  });
});
