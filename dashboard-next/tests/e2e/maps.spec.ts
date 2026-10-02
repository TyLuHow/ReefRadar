import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * Real-browser checks for the MapLibre monitoring map (03-08, PLAT-02).
 *
 * The CARTO style is replaced by a tiny local style so the run is deterministic and
 * offline; it carries the same attribution text as the real style, which the map
 * must keep visible. The map instance is read from window.__reefMap, a hook that only
 * exists when the build ran with NEXT_PUBLIC_E2E_HOOKS=1 (playwright.config.ts).
 */

const MAP_PATH = '/dashboard/map/';

const STUB_STYLE = {
  version: 8,
  sources: {
    stub: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution:
        '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#1a1714' } },
    { id: 'stub-fill', type: 'fill', source: 'stub', paint: { 'fill-color': '#000000' } },
  ],
};

/** Set MAPS_REAL_STYLE=1 to run against the real CARTO style (needs network; not used in CI). */
async function stubMapStyle(page: Page) {
  if (process.env.MAPS_REAL_STYLE === '1') return;
  await page.route(/dark-matter-gl-style\/style\.json/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(STUB_STYLE),
    }),
  );
}

async function hasWebGL2(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl !== null;
  });
}

/** Record whether this browser provides WebGL2 (assumption A1 for the Linux CI image). */
async function recordWebGL2(page: Page): Promise<boolean> {
  const available = await hasWebGL2(page);
  const description = available ? 'WebGL2 available' : 'WebGL2 NOT available';
  test.info().annotations.push({ type: 'webgl2', description });
  console.log(`[maps.spec] ${description}`);
  return available;
}

async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => {
      const map = (window as unknown as { __reefMap?: { isStyleLoaded(): boolean; getSource(id: string): unknown } }).__reefMap;
      return !!map && map.isStyleLoaded() && !!map.getSource('sites');
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe('monitoring map (MapLibre)', () => {
  test('renders the canvas with visible attribution and no page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await mockApi(page);
    await stubMapStyle(page);
    await page.goto(MAP_PATH, { waitUntil: 'load' });

    const webgl2 = await recordWebGL2(page);
    if (!webgl2) {
      test.skip(true, 'No WebGL2 in this browser: the real-render branch cannot run here.');
    }

    await expect(page.getByRole('region', { name: 'Monitoring network map' })).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await waitForMap(page);

    const attribution = page.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText(/OpenStreetMap|CARTO/);
    await expect(page.getByText('Initializing map...')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('worker is served from /maplibre/ (not a bundler chunk)', async ({ request }) => {
    for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      const res = await request.get(`/maplibre/${file}`);
      expect(res.status(), file).toBe(200);
    }
  });

  test('without WebGL the fallback renders', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await mockApi(page);
    await stubMapStyle(page);
    await page.goto(MAP_PATH, { waitUntil: 'load' });

    await expect(page.getByText('WebGL is required for the interactive map')).toBeVisible();
    await expect(page.getByText(/Your browser or device does not support WebGL/)).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  });

  test('clicking a site circle opens its popup; Close popup removes it', async ({ page }) => {
    await mockApi(page);
    await stubMapStyle(page);
    await page.goto(MAP_PATH, { waitUntil: 'load' });
    test.skip(!(await recordWebGL2(page)), 'No WebGL2 in this browser.');
    await waitForMap(page);

    // Pick the most geographically isolated full-data site, zoom onto it, then click the
    // canvas centre, so the click cannot land on a neighbouring circle.
    const target = await page.evaluate(async () => {
      type MapLike = {
        querySourceFeatures(id: string): { properties: { site_id: string; has_embedding: boolean }; geometry: { coordinates: [number, number] } }[];
        jumpTo(o: { center: [number, number]; zoom: number }): void;
        once(ev: string, cb: () => void): void;
        getCanvas(): HTMLCanvasElement;
      };
      const map = (window as unknown as { __reefMap: MapLike }).__reefMap;
      const seen = new Map<string, { id: string; c: [number, number] }>();
      for (const f of map.querySourceFeatures('sites')) {
        if (!f.properties.has_embedding) continue;
        seen.set(f.properties.site_id, { id: f.properties.site_id, c: f.geometry.coordinates });
      }
      const all = [...seen.values()];
      let best: { id: string; c: [number, number]; d: number } | null = null;
      for (const s of all) {
        let d = Infinity;
        for (const o of all) {
          if (o.id === s.id) continue;
          d = Math.min(d, Math.hypot(o.c[0] - s.c[0], o.c[1] - s.c[1]));
        }
        if (!best || d > best.d) best = { ...s, d };
      }
      if (!best) return null;
      map.jumpTo({ center: best.c, zoom: 11 });
      await new Promise<void>((resolve) => map.once('idle', () => resolve()));
      const rect = map.getCanvas().getBoundingClientRect();
      return { id: best.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    expect(target, 'a full-data site to click').not.toBeNull();

    await page.mouse.move(target!.x, target!.y);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __reefMap: { getCanvas(): HTMLCanvasElement } }).__reefMap.getCanvas().style.cursor))
      .toBe('pointer');
    await page.mouse.click(target!.x, target!.y);

    const closeButton = page.getByRole('button', { name: 'Close popup' });
    await expect(closeButton).toBeVisible();
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: target!.id })).toBeVisible();

    await closeButton.click();
    await expect(page.getByRole('button', { name: 'Close popup' })).toHaveCount(0);
  });

  test('choosing a region flies the map there', async ({ page }) => {
    await mockApi(page);
    await stubMapStyle(page);
    await page.goto(MAP_PATH, { waitUntil: 'load' });
    test.skip(!(await recordWebGL2(page)), 'No WebGL2 in this browser.');
    await waitForMap(page);

    await page.getByRole('combobox').selectOption('kenya');
    // Kenya Coast: lat -3, lon 40, zoom 8 (src/lib/regions.ts); the fly-to takes 1500 ms.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (window as unknown as { __reefMap: { getCenter(): { lat: number; lng: number }; getZoom(): number } }).__reefMap;
            const c = map.getCenter();
            return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
          }),
        { timeout: 8_000 },
      )
      .toMatchObject({ lat: expect.closeTo(-3, 0), lng: expect.closeTo(40, 0), zoom: expect.closeTo(8, 0) });
  });

  test('prefers-reduced-motion: the region jump is immediate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await stubMapStyle(page);
    await page.goto(MAP_PATH, { waitUntil: 'load' });
    test.skip(!(await recordWebGL2(page)), 'No WebGL2 in this browser.');
    await waitForMap(page);

    await page.getByRole('combobox').selectOption('kenya');
    // Far shorter than the 1500 ms animation: the centre is already at the target.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = (window as unknown as { __reefMap: { getCenter(): { lat: number; lng: number } } }).__reefMap.getCenter();
            return { lat: c.lat, lng: c.lng };
          }),
        { timeout: 600 },
      )
      .toMatchObject({ lat: expect.closeTo(-3, 0), lng: expect.closeTo(40, 0) });
  });
});

/**
 * /sites world map on MapLibre with an OpenStreetMap raster base (03-09, PLAT-02).
 * Tile requests are fulfilled locally with a transparent PNG: CI never reaches
 * tile.openstreetmap.org (OSM tile usage policy).
 */

const SITES_PATH = '/sites/';

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function stubOsmTiles(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
  );
}

const MARKER_LABEL = /^[A-Za-z0-9_.-]+, [^,]+, (Healthy|Degraded|Restored Early|Restored Mid|Unknown)$/;

test.describe('sites world map (MapLibre, OSM raster)', () => {
  test('renders the OSM map with visible attribution, zoom buttons and keyboard-operable markers', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await mockApi(page);
    await stubOsmTiles(page);
    await page.goto(SITES_PATH, { waitUntil: 'load' });
    test.skip(!(await recordWebGL2(page)), 'No WebGL2 in this browser: the real-render branch cannot run here.');

    await expect(page.getByRole('region', { name: 'Map of reef recording sites' })).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();

    const attribution = page.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenStreetMap contributors');
    await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );

    // The legend must not cover the attribution text (OSM licence).
    const link = attribution.getByRole('link', { name: 'OpenStreetMap' });
    await link.scrollIntoViewIfNeeded();
    const hitTag = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit) ? 'link' : (hit ? `${hit.tagName}.${hit.className}` : 'nothing (off screen)');
    });
    expect(hitTag, 'the element on top of the attribution link').toBe('link');

    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();

    const marker = page.getByRole('button', { name: MARKER_LABEL }).first();
    await expect(marker).toBeAttached();
    const label = (await marker.getAttribute('aria-label')) as string;
    const siteId = label.split(',')[0];

    await marker.focus();
    await page.keyboard.press('Enter');
    const close = page.getByRole('button', { name: 'Close popup' });
    await expect(close).toBeVisible();
    await expect(close).toBeFocused();
    await expect(
      page.getByRole('region', { name: 'Map of reef recording sites' }).getByRole('heading', { level: 3, name: siteId }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close popup' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test('without WebGL the fallback renders and the site list still renders', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await mockApi(page);
    await stubOsmTiles(page);
    await page.goto(SITES_PATH, { waitUntil: 'load' });

    await expect(page.getByText('WebGL is required for the interactive map')).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'All Sites' })).toBeVisible();
  });
});

/**
 * Analysis-result mini map on MapLibre (03-10, PLAT-02). Tiles are stubbed like the
 * /sites map; the result comes from a mocked analysis, so nothing reaches the live API.
 */

const ANALYZE_PATH = '/dashboard/analyze/';
const AUDIO_FIXTURE = path.join(__dirname, '..', '..', 'public', 'audio', 'marrs', 'aus_D1_20230208_120000.wav');

async function runMockedAnalysis(page: Page) {
  await mockApi(page, {
    'POST /upload': { upload_id: 'up-mm', filename: 'aus_D1_20230208_120000.wav', size: 1000, status: 'uploaded' },
    'POST /analyze': { analysis_id: 'fixture-mini-map', upload_id: 'up-mm', status: 'processing' },
    'GET /status/*': 'status-complete.json',
    'GET /visualize/*': 'visualize-3class-no-coords.json',
  });
  await stubOsmTiles(page);
  await page.goto(ANALYZE_PATH, { waitUntil: 'load' });
  await page.setInputFiles('input[type="file"]', AUDIO_FIXTURE);
  await page.getByRole('button', { name: /analyze audio/i }).click();
  await expect(page.getByRole('button', { name: /analyze another file/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('analysis result mini map (MapLibre)', () => {
  test('shows the similar sites with rank badges and visible OSM attribution', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await runMockedAnalysis(page);
    test.skip(!(await recordWebGL2(page)), 'No WebGL2 in this browser: the real-render branch cannot run here.');

    const results = page.getByRole('region', { name: 'Map of similar reference sites' });
    await expect(results).toBeVisible();
    await expect(results.locator('.maplibregl-canvas')).toBeVisible();
    // Rank badge for the top site (unchanged from the Leaflet version).
    await expect(results.getByText('ind_H4', { exact: true })).toBeVisible();
    await expect(results.getByText('91%', { exact: true })).toBeVisible();

    const attribution = results.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenStreetMap');
    // No zoom control on the mini map, and the map is 200px high.
    await expect(results.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
    const box = await results.locator('.maplibregl-map').boundingBox();
    expect(Math.round(box!.height)).toBe(200);
    expect(pageErrors).toEqual([]);
  });

  test('without WebGL the 200px fallback shows its single line', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await runMockedAnalysis(page);

    await expect(page.getByText('WebGL is required for the interactive map')).toBeVisible();
    await expect(page.getByText(/Your browser or device does not support WebGL/)).toHaveCount(0);
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  });
});
