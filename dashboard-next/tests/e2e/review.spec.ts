import { test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Review-only unhidden captures (03-14, PLAT-01, DS-07, UI-SPEC protocol step 6).
 *
 * The gating visual baseline hides every canvas and map (visibility: hidden), so it
 * cannot show the vitality removal or the map port. This spec photographs six pages
 * at 1440 px with canvases and maps VISIBLE, once at the Phase 3 head and once at the
 * before ref, so the owner can compare them on the review page
 * (scripts/build-visual-review.mjs, "Map and canvas changes").
 *
 * It asserts nothing about pixels and never gates anything. It is self-contained on
 * purpose: CI copies this file and playwright.review.config.ts into the before tree,
 * where only ./support/mock-api (present at that ref) is available. Run it only with
 * playwright.review.config.ts; the e2e and visual projects ignore it.
 *
 * Output: REVIEW_OUT (default review-captures) gets <state>.png and meta.json, an
 * array of { state, webgl2, engines, canvases } so the page can say whether a map
 * actually rendered or fell back (assumption A1: WebGL2 in the Linux image).
 */

const OUT_DIR = path.resolve(process.env.REVIEW_OUT ?? 'review-captures');

const AUDIO_FIXTURE = path.join(__dirname, '..', '..', 'public', 'audio', 'marrs', 'aus_D1_20230208_120000.wav');

// 1x1 transparent PNG: fulfils map tile requests so markers and overlays are comparable.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

interface ReviewState {
  name: string;
  path: string | null; // null: reached by running the mocked analysis flow
}

const REVIEW_STATES: ReviewState[] = [
  { name: 'landing', path: '/' },
  { name: 'experience', path: '/experience/' },
  { name: 'experience-compare', path: '/experience/?mode=compare' },
  { name: 'sites', path: '/sites/' },
  { name: 'map', path: '/dashboard/map/' },
  { name: 'analyze', path: null },
];

interface MetaEntry {
  state: string;
  webgl2: boolean;
  engines: string[];
  canvases: number;
}

async function blockMapTiles(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
  await page.route(/cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
}

async function reachCompletedAnalysis(page: Page): Promise<void> {
  await page.goto('/dashboard/analyze/', { waitUntil: 'load' });
  await page.setInputFiles('input[type="file"]', AUDIO_FIXTURE);
  await page.getByRole('button', { name: /analyze audio/i }).click();
  await page.getByRole('button', { name: /analyze another file/i }).waitFor({ state: 'visible', timeout: 30_000 });
  // The result's mini map loads lazily; give it a bounded chance to appear (best effort).
  await page
    .locator('.maplibregl-canvas, .leaflet-container')
    .first()
    .waitFor({ state: 'attached', timeout: 10_000 })
    .catch(() => {});
}

async function describePage(page: Page, state: string): Promise<MetaEntry> {
  return page.evaluate((name) => {
    const probe = document.createElement('canvas');
    let webgl2 = false;
    try {
      webgl2 = probe.getContext('webgl2') !== null;
    } catch {
      webgl2 = false;
    }
    const engines: string[] = [];
    if (document.querySelector('.maplibregl-canvas')) engines.push('maplibre');
    if (document.querySelector('.leaflet-container')) engines.push('leaflet');
    return { state: name, webgl2, engines, canvases: document.querySelectorAll('canvas').length };
  }, state);
}

function appendMeta(entry: MetaEntry): void {
  const file = path.join(OUT_DIR, 'meta.json');
  let entries: MetaEntry[] = [];
  if (fs.existsSync(file)) {
    try {
      entries = JSON.parse(fs.readFileSync(file, 'utf-8')) as MetaEntry[];
    } catch {
      entries = [];
    }
  }
  entries = entries.filter((e) => e.state !== entry.state);
  entries.push(entry);
  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + '\n');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  // A stale meta.json from an earlier run must not describe this run's captures.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(path.join(OUT_DIR, 'meta.json'), { force: true });
});

for (const state of REVIEW_STATES) {
  test(`review capture: ${state.name}`, async ({ page }) => {
    await mockApi(page, {
      'POST /upload': { upload_id: 'up-review', filename: 'aus_D1_20230208_120000.wav', size: 1000, status: 'uploaded' },
      'POST /analyze': { analysis_id: 'fixture-review', upload_id: 'up-review', status: 'processing' },
      'GET /status/*': 'status-complete.json',
      'GET /visualize/*': 'visualize-3class-no-coords.json',
    });
    await blockMapTiles(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    if (state.path === null) {
      await reachCompletedAnalysis(page);
    } else {
      await page.goto(state.path, { waitUntil: 'load' });
    }
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const meta = await describePage(page, state.name);
    await page.screenshot({
      path: path.join(OUT_DIR, `${state.name}.png`),
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
    appendMeta(meta);
  });
}
