import { test, expect, type Page } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

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

// Banned claims (TRUTH-07): species/behaviour names, condition claims not
// backed by the manifest, and the "living spectrogram" fabrication.
const BANNED_CLAIMS = [
  'fish call',
  'fish chorus',
  'parrotfish',
  'snapping shrimp',
  'shrimp activity',
  'bleaching',
  'bleached',
  'coral cover',
  'overfishing',
  'living spectrogram',
  'biotic complexity',
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

test.describe('Honest copy, no fabricated claims (Task 2)', () => {
  test('/dashboard/compare contains no banned claims and discloses MARRS attribution', async ({ page }) => {
    await mockApi(page);
    await page.goto('/dashboard/compare/');
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of BANNED_CLAIMS) {
      expect(bodyText, `banned claim "${claim}" found on /dashboard/compare`).not.toContain(claim);
    }
    expect(bodyText).toContain('williams & jones 2025');
  });

  test('/experience?mode=demo contains no banned claims and discloses MARRS attribution', async ({ page }) => {
    await mockApi(page);
    await page.goto('/experience/?mode=demo');
    await expect(page.getByRole('button', { name: /^play$/i })).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of BANNED_CLAIMS) {
      expect(bodyText, `banned claim "${claim}" found on /experience?mode=demo`).not.toContain(claim);
    }
    expect(bodyText).toContain('assigned by marrs');
  });

  test('crossfader shows static endpoint captions regardless of slider position', async ({ page }) => {
    await mockApi(page);
    await page.goto('/dashboard/compare/');
    const before = await page.locator('body').innerText();
    const slider = page.getByRole('slider', { name: /crossfade between healthy and degraded/i });
    await slider.focus();
    await slider.press('End');
    const after = await page.locator('body').innerText();
    expect(after).toBe(before);
  });
});

test.describe('Location Compare: real files only, no missing audio (Task 3)', () => {
  test('the compare manifest lists only aus and ind, and every file path returns 200', async ({ request, baseURL }) => {
    const manifestRes = await request.get(`${baseURL}/audio/compare/manifest.json`);
    expect(manifestRes.ok()).toBe(true);
    const manifest = await manifestRes.json();

    expect(manifest.locations.map((l: { id: string }) => l.id).sort()).toEqual(['aus', 'ind']);

    for (const location of manifest.locations) {
      for (const filePath of Object.values(location.files) as string[]) {
        const res = await request.get(`${baseURL}${filePath}`);
        expect(res.ok(), `${filePath} should return 200`).toBe(true);
      }
    }
  });

  test('/experience?mode=compare contains no banned claims and no invented biology', async ({ page }) => {
    await mockApi(page);
    await page.goto('/experience/?mode=compare');
    await expect(page.getByText('Compare Locations').first()).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of BANNED_CLAIMS) {
      expect(bodyText, `banned claim "${claim}" found on /experience?mode=compare`).not.toContain(claim);
    }
    expect(bodyText).not.toContain('5 countries');
  });
});
