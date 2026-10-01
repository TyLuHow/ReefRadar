import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

/**
 * Audio-surface truth suite (01-17, TRUTH-03/07/08, D-05/D-07/D-09/D-16).
 *
 * Covers the legacy listening surfaces this plan rewires onto real,
 * manifest-sourced MARRS excerpts: the A/B demo (/dashboard/compare), the
 * crossfader, Experience demo mode (/experience?mode=demo) and Location
 * Compare (/experience?mode=compare). Grows across Task 1/2/3 of this plan.
 */

const DEMO_PAIR_PATHS = [
  '/audio/marrs/ind_H1_20220830_120000.wav',
  '/audio/marrs/ind_D1_20220830_120000.wav',
];

async function trackAudioRequests(page: Page) {
  const audioRequests: { path: string; status: number; contentType: string | null }[] = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/audio/')) return;
    audioRequests.push({
      path: url.pathname,
      status: response.status(),
      contentType: response.headers()['content-type'] ?? null,
    });
  });
  return audioRequests;
}

test.describe('A/B demo plays the real, manifest-sourced pair (Task 1)', () => {
  test('/dashboard/compare requests exactly the demoPair excerpts', async ({ page }) => {
    await mockApi(page);
    const audioRequests = await trackAudioRequests(page);

    await page.goto('/dashboard/compare/');
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect.poll(() => audioRequests.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

    const paths = audioRequests.map((r) => r.path).sort();
    expect(paths).toEqual([...DEMO_PAIR_PATHS].sort());
    for (const req of audioRequests) {
      expect(req.status).toBe(200);
      expect(req.contentType).toContain('audio/wav');
    }
  });

  test('/experience?mode=demo requests exactly the demoPair excerpts', async ({ page }) => {
    await mockApi(page);
    const audioRequests = await trackAudioRequests(page);

    await page.goto('/experience/?mode=demo');
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect.poll(() => audioRequests.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

    const paths = audioRequests.map((r) => r.path).sort();
    expect(paths).toEqual([...DEMO_PAIR_PATHS].sort());
  });
});
