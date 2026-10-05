import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * Token bridge (04-20, DS-01, phase success criterion 1): ONE token change visibly changes a UI
 * swatch, an Observable Plot mark and a MapLibre circle paint, on the tile-free probe at
 * /dev/fixtures/token-probe. The map instance is read from window.__tokenProbeMap, a hook that only
 * exists when the build ran with NEXT_PUBLIC_E2E_HOOKS=1 (playwright.config.ts).
 *
 * The map needs WebGL2, so this spec follows maps.spec.ts: a local machine without it skips with the
 * reason recorded, while in CI (which sets CI) a missing WebGL2 is a failure, so the proof can never
 * vanish silently.
 */

const PROBE = 'section#token-probe';
const SURFACE = '[data-surface="instrument"]';
const SENTINEL_HEX = '#B00020';
const SENTINEL_RGB = 'rgb(176, 0, 32)';

type ProbeMap = {
  loaded(): boolean;
  isStyleLoaded(): boolean;
  getLayer(id: string): unknown;
  getPaintProperty(layer: string, property: string): unknown;
};

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

async function requireWebGL2(page: Page, reason: string) {
  const available = await page.evaluate(() => document.createElement('canvas').getContext('webgl2') !== null);
  const description = available ? 'WebGL2 available' : 'WebGL2 NOT available';
  test.info().annotations.push({ type: 'webgl2', description });
  console.log(`[token-bridge.spec] ${description}`);
  if (process.env.CI) {
    expect(available, 'CI image must provide WebGL2 (software GL); the token-bridge proof may not be skipped in CI').toBe(true);
  } else {
    test.skip(!available, reason);
  }
}

async function openProbe(page: Page, query = '') {
  await page.goto(`/dev/fixtures/token-probe/${query}`, { waitUntil: 'load' });
  await expect(page.locator(SURFACE)).toBeVisible();
  await requireWebGL2(page, 'No WebGL2 in this browser: the map half of the proof cannot run here (CI runs it).');
  await page.waitForFunction(
    () => {
      const map = (window as unknown as { __tokenProbeMap?: ProbeMap }).__tokenProbeMap;
      return !!map && map.loaded() && !!map.getLayer('probe-sites-circles');
    },
    undefined,
    { timeout: 30_000 },
  );
  // The plot is drawn from the same contract sites; wait for its marks before reading them.
  await expect(page.locator(`${PROBE} svg path[fill="var(--dir-hab-healthy)"]`).first()).toBeVisible({ timeout: 30_000 });
}

const swatchBackground = (page: Page, status: string) =>
  page.locator(`${PROBE} [data-probe-swatch="${status}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);

const markFill = (page: Page, status: string) =>
  page.locator(`${PROBE} svg path[fill="var(--dir-hab-${status})"]`).first().evaluate((el) => getComputedStyle(el).fill);

const paint = (page: Page, layer: string, property: string) =>
  page.evaluate(
    ([l, p]) => JSON.stringify((window as unknown as { __tokenProbeMap: ProbeMap }).__tokenProbeMap.getPaintProperty(l, p)),
    [layer, property],
  );

/** A resolved custom property of the surface root, as the six-digit lower-case hex tokens.css authors (a built app may shorten it). */
async function rootToken(page: Page, name: string): Promise<string> {
  const raw = await page.locator(SURFACE).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim().toLowerCase(), name);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : raw;
}

function hexToRgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

test.describe('token bridge: one token, three consumers', () => {
  test('?tok= on --dir-hab-healthy changes the swatch, the Plot mark and the map circle-color', async ({ page }) => {
    await openProbe(page, '?tok=--dir-hab-healthy:%23B00020');

    await expect.poll(() => swatchBackground(page, 'healthy')).toBe(SENTINEL_RGB);
    await expect.poll(() => markFill(page, 'healthy')).toBe(SENTINEL_RGB);
    await expect.poll(async () => (await paint(page, 'probe-sites-circles', 'circle-color')).toLowerCase()).toContain(SENTINEL_HEX.toLowerCase());

    // Only that token changed: another status keeps its own colour on all three.
    await expect.poll(async () => (await swatchBackground(page, 'degraded')) !== SENTINEL_RGB).toBe(true);
    await expect.poll(async () => (await paint(page, 'probe-sites-circles', 'circle-color')).toLowerCase().split(SENTINEL_HEX.toLowerCase()).length - 1).toBe(1);
  });

  test('switching the direction re-reads the tokens and updates the map paint without a style reset', async ({ page }) => {
    await openProbe(page);
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'atlas');
    const atlasGround = await rootToken(page, '--dir-ground');
    await expect.poll(async () => (await paint(page, 'probe-background', 'background-color')).toLowerCase()).toBe(JSON.stringify(atlasGround));

    // setStyle would load a new style (a style.load event and a flash); setPaintProperty does not.
    await page.evaluate(() => {
      const w = window as unknown as { __styleLoads: number; __tokenProbeMap: { on(type: string, cb: () => void): void } };
      w.__styleLoads = 0;
      w.__tokenProbeMap.on('style.load', () => {
        w.__styleLoads += 1;
      });
    });

    await page.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio', { name: 'Nocturne' }).click();
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'nocturne');

    await expect
      .poll(async () => {
        const ground = await rootToken(page, '--dir-ground');
        return ground !== atlasGround && (await paint(page, 'probe-background', 'background-color')).toLowerCase() === JSON.stringify(ground);
      })
      .toBe(true);
    await expect
      .poll(async () => (await swatchBackground(page, 'healthy')) === hexToRgb(await rootToken(page, '--dir-hab-healthy')))
      .toBe(true);
    await expect
      .poll(async () => (await paint(page, 'probe-sites-circles', 'circle-color')).toLowerCase().includes((await rootToken(page, '--dir-hab-healthy')).toLowerCase()))
      .toBe(true);
    await expect.poll(async () => (await markFill(page, 'healthy')) === hexToRgb(await rootToken(page, '--dir-hab-healthy'))).toBe(true);

    // The paint changed without the style being reloaded.
    expect(await page.evaluate(() => (window as unknown as { __styleLoads: number }).__styleLoads)).toBe(0);
  });

  test('a live inline override of --dir-hab-degraded is followed by the swatch, the Plot mark and the map', async ({ page }) => {
    await openProbe(page);
    await page.locator(SURFACE).evaluate((el) => (el as HTMLElement).style.setProperty('--dir-hab-degraded', '#00A000'));

    await expect.poll(() => swatchBackground(page, 'degraded')).toBe('rgb(0, 160, 0)');
    await expect.poll(() => markFill(page, 'degraded')).toBe('rgb(0, 160, 0)');
    await expect.poll(async () => (await paint(page, 'probe-sites-circles', 'circle-color')).toLowerCase()).toContain('#00a000');
  });

  test('the probe has no serious or critical axe violation', async ({ page }) => {
    await openProbe(page);
    const results = await new AxeBuilder({ page }).include(PROBE).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('the probe map never touches the network for tiles, glyphs or sprites', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && !/^data:|^blob:/.test(request.url())) external.push(request.url());
    });
    await openProbe(page);
    expect(external.filter((url) => !/contract|execute-api|amazonaws|cloudfront/.test(url))).toEqual([]);
  });
});
