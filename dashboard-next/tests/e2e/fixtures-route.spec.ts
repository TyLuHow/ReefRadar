import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * /dev/fixtures route (04-06, 04-07, DS-08). The e2e build carries NEXT_PUBLIC_DEV_FIXTURES=1
 * (playwright.config.ts webServer.env); the flag-less production exclusion is proven in CI by
 * scripts/check-dev-fixtures-excluded.mjs.
 */

const SURFACE = '[data-surface="instrument"]';
// tests/e2e -> tests -> dashboard-next -> repo root: the model version the mocked contract serves.
const MODEL_VERSION = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'model_version.json'), 'utf8')) as {
    model_version: string;
  }
).model_version;
const NEW_FONT_FAMILY = /newsreader|hanken|spline|archivo/i;

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

async function openFixtures(page: Page, query = '') {
  const response = await page.goto(`/dev/fixtures/${query}`, { waitUntil: 'load' });
  await expect(page.locator(SURFACE)).toBeVisible();
  return response;
}

test.describe('/dev/fixtures', () => {
  test('serves 200, is noindex and has no legacy shell', async ({ page }) => {
    const response = await openFixtures(page);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // The legacy Navbar is absent; the only navigation is the fixtures section list.
    await expect(page.locator('nav')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Fixture sections' })).toBeVisible();
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'ReefRadar' })).toBeVisible();
  });

  test('direction defaults to atlas, accepts the three directions and ignores anything else', async ({ page }) => {
    await openFixtures(page);
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'atlas');

    await openFixtures(page, '?direction=poster');
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'poster');

    await openFixtures(page, '?direction=nocturne');
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'nocturne');

    await openFixtures(page, '?direction=evil');
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'atlas');
  });

  test('?reduced=1 sets data-reduced-motion and any other value leaves it off', async ({ page }) => {
    await openFixtures(page, '?reduced=1');
    await expect(page.locator(SURFACE)).toHaveAttribute('data-reduced-motion', 'true');

    await openFixtures(page, '?reduced=yes');
    await expect(page.locator(SURFACE)).not.toHaveAttribute('data-reduced-motion', /.*/);
  });

  test('?tok= applies a hex --dir-* override and ignores anything else', async ({ page }) => {
    await openFixtures(page, '?tok=--dir-hab-healthy:%23B00020');
    await expect
      .poll(() => page.locator(SURFACE).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--dir-hab-healthy')))
      .toBe('#B00020');

    await openFixtures(page, '?tok=--dir-x:red');
    const inline = await page.locator(SURFACE).evaluate((el) => (el as HTMLElement).getAttribute('style') ?? '');
    expect(inline).not.toContain('--dir-x');
    expect(inline).not.toContain('red');

    await openFixtures(page, '?tok=background:url(x)');
    const inlineBackground = await page.locator(SURFACE).evaluate((el) => (el as HTMLElement).getAttribute('style') ?? '');
    expect(inlineBackground).not.toContain('url(');
  });

  for (const direction of ['atlas', 'nocturne', 'poster']) {
    test(`body background equals --dir-ground for ${direction}`, async ({ page }) => {
      await openFixtures(page, `?direction=${direction}`);
      // The legacy global rule transitions background-color over 150 ms, so poll for the settled value.
      await expect
        .poll(async () => {
          const { body, ground } = await page.locator(SURFACE).evaluate((root) => {
            const token = getComputedStyle(root).getPropertyValue('--dir-ground').trim();
            // Resolve the authored hex to the browser's computed rgb() form.
            const probe = document.createElement('div');
            probe.style.backgroundColor = token;
            document.body.appendChild(probe);
            const resolved = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return { body: getComputedStyle(document.body).backgroundColor, ground: resolved };
          });
          return ground.startsWith('rgb(') && body === ground;
        })
        .toBe(true);
    });
  }
});

const DIRECTION_GROUP = { name: 'Direction' } as const;

test.describe('/dev/fixtures chrome (04-07)', () => {
  test('the Direction switcher updates the URL and data-direction, and a reload restores it', async ({ page }) => {
    await openFixtures(page);
    const group = page.getByRole('radiogroup', DIRECTION_GROUP);
    await expect(group.getByRole('radio', { name: 'Atlas' })).toBeChecked();

    await group.getByRole('radio', { name: 'Nocturne' }).click();
    await expect(page).toHaveURL(/[?&]direction=nocturne(&|$)/);
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'nocturne');

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'nocturne');
    await expect(page.getByRole('radiogroup', DIRECTION_GROUP).getByRole('radio', { name: 'Nocturne' })).toBeChecked();

    await page.getByRole('radiogroup', DIRECTION_GROUP).getByRole('radio', { name: 'Poster' }).click();
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'poster');
    await expect(page).toHaveURL(/[?&]direction=poster(&|$)/);
  });

  test('the Reduced motion toggle sets data-reduced-motion and ?reduced=1, and a reload restores it', async ({ page }) => {
    await openFixtures(page);
    const toggle = page.getByRole('button', { name: 'Reduced motion' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(page.locator(SURFACE)).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page).toHaveURL(/[?&]reduced=1(&|$)/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator(SURFACE)).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.getByRole('button', { name: 'Reduced motion' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Reduced motion' }).click();
    await expect(page.locator(SURFACE)).not.toHaveAttribute('data-reduced-motion', /.*/);
    await expect(page).not.toHaveURL(/reduced=/);
  });

  test('switching keeps the other query parameters', async ({ page }) => {
    await openFixtures(page, '?reduced=1&tok=--dir-hab-healthy:%23B00020');
    await page.getByRole('radiogroup', DIRECTION_GROUP).getByRole('radio', { name: 'Poster' }).click();
    await expect(page).toHaveURL(/direction=poster/);
    await expect(page).toHaveURL(/reduced=1/);
    await expect(page).toHaveURL(/tok=--dir-hab-healthy/);
    await expect(page.locator(SURFACE)).toHaveAttribute('data-reduced-motion', 'true');
  });

  test('the contract pin shows the contract version and the model version of the mocked contract', async ({ page }) => {
    await openFixtures(page);
    await expect(page.getByTestId('contract-pin')).toHaveText(`Contract v1 · ${MODEL_VERSION}`);
  });

  test('the index lists every section and each state cell carries its markers', async ({ page }) => {
    await openFixtures(page);
    await expect(page.locator('section#tokens')).toHaveCount(1);
    await expect(page.locator('section#status-palette')).toHaveCount(1);
    expect(await page.locator('[data-fixture-state]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-fixture-state]:not([data-fixture-primitive])')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Fixture sections' });
    await expect(nav.getByRole('link', { name: 'Tokens' })).toHaveAttribute('href', '#tokens');
    await expect(nav.getByRole('link', { name: 'Status palette' })).toHaveAttribute('href', '#status-palette');
  });

  test('a single-section page renders only that section and its nav keeps the direction', async ({ page }) => {
    const response = await page.goto('/dev/fixtures/status-palette/?direction=poster', { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', 'poster');
    await expect(page.locator('section#status-palette')).toHaveCount(1);
    await expect(page.locator('section#tokens')).toHaveCount(0);
    const primitives = await page
      .locator('[data-fixture-primitive]')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-fixture-primitive')))]);
    expect(primitives).toEqual(['status-palette']);

    const nav = page.getByRole('navigation', { name: 'Fixture sections' });
    await expect(nav.getByRole('link', { name: 'Tokens' })).toHaveAttribute('href', '/dev/fixtures/tokens/?direction=poster');
    await expect(nav.getByRole('link', { name: 'Status palette' })).toHaveAttribute('aria-current', 'page');
  });

  test('an unknown section slug answers 404', async ({ page }) => {
    const response = await page.goto('/dev/fixtures/not-a-section/', { waitUntil: 'load' });
    expect(response?.status()).toBe(404);
    await expect(page.locator(SURFACE)).toHaveCount(0);
  });
});

test.describe('/dev/fixtures foundation sections (04-07)', () => {
  test('surface swatch labels are the live --dir-* values and follow the direction', async ({ page }) => {
    await openFixtures(page, '?direction=atlas');
    const label = page.locator('section#tokens [data-fixture-state="surfaces"] p', { hasText: /^#/ }).first();
    const ground = () => page.locator(SURFACE).evaluate((el) => getComputedStyle(el).getPropertyValue('--dir-ground').trim().toLowerCase());
    const shown = async () => ((await label.textContent()) ?? '').trim().toLowerCase();
    // Read both values inside one poll and require a non-empty match: the surface may not have
    // resolved --dir-ground yet, and a value captured once before polling could be "" forever.
    const labelMatchesGround = async () => {
      const [g, l] = [await ground(), await shown()];
      return g !== '' && l === g;
    };
    await expect.poll(labelMatchesGround).toBe(true);
    const atlasGround = await ground();

    await page.getByRole('radiogroup', DIRECTION_GROUP).getByRole('radio', { name: 'Nocturne' }).click();
    await expect.poll(async () => (await ground()) !== atlasGround && (await labelMatchesGround())).toBe(true);
  });

  test('tokens section names the current direction and reads durations as 0ms under reduced motion', async ({ page }) => {
    await openFixtures(page, '?direction=poster&reduced=1');
    await expect(page.locator('section#tokens [data-fixture-state="direction"]')).toContainText('poster');
    const motion = page.locator('section#tokens [data-fixture-state="motion"]');
    await expect(motion).toContainText(/--duration-fast\s*0ms/);
    await expect(motion).toContainText(/--duration-view\s*0ms/);
    await expect(motion).toContainText('Reduced motion is on');
  });

  test('status palette marks, CVD rows and contrast follow a ?tok= override', async ({ page }) => {
    await openFixtures(page);
    const palette = page.locator('section#status-palette');
    const healthyOnGround = palette.locator('td[data-status="healthy"][data-ground="ground"]');
    await expect(healthyOnGround).toContainText(' : 1');
    const before = await healthyOnGround.textContent();

    await openFixtures(page, '?tok=--dir-hab-healthy:%23B00020');
    await expect(palette.locator('[data-fixture-state="marks"]')).toContainText(/#b00020/i);
    await expect(palette.locator('[data-vision="normal"] [data-swatch="healthy"]')).toHaveCSS('background-color', 'rgb(176, 0, 32)');
    await expect.poll(async () => healthyOnGround.textContent()).not.toBe(before);

    // Four vision rows, and a contrast cell for every status on every ground.
    await expect(palette.locator('[data-vision]')).toHaveCount(4);
    await expect(palette.locator('td[data-status][data-ground]')).toHaveCount(15);
  });
});

test.describe('font scoping', () => {
  test('a legacy route loads none of the new fonts', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() => [...document.fonts].map((face) => face.family));
    expect(families.filter((family) => NEW_FONT_FAMILY.test(family))).toEqual([]);
  });

  test('/dev/fixtures with atlas never requests an Archivo Black file', async ({ page }, testInfo) => {
    // next/font hashes the file names, so the Archivo Black request is identified through the
    // FontFace the browser registered for it: its status stays "unloaded" until a glyph needs it,
    // and a font request is made only after it leaves "unloaded".
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(new URL(request.url()).pathname);
    });
    await openFixtures(page, '?direction=atlas');
    await page.evaluate(() => document.fonts.ready);

    const faces = await page.evaluate(() => [...document.fonts].map((face) => ({ family: face.family, status: face.status })));
    const archivo = faces.filter((face) => /archivo/i.test(face.family));
    const record = { fontRequests: fontRequests.length, archivoFaces: archivo, loadedFamilies: faces.filter((f) => f.status === 'loaded').map((f) => f.family) };
    await testInfo.attach('archivo-font-load-atlas', { body: JSON.stringify(record, null, 2), contentType: 'application/json' });
    // Printed for RESEARCH assumption A2 (preload: false keeps Archivo Black off atlas).
    console.log('A2 archivo-font-load-atlas', JSON.stringify(record));

    expect(archivo.every((face) => face.status === 'unloaded')).toBe(true);
  });
});
