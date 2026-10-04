import { test, expect, type Page } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * /dev/fixtures route (04-06, DS-08). The e2e build carries NEXT_PUBLIC_DEV_FIXTURES=1
 * (playwright.config.ts webServer.env); the flag-less production exclusion is proven in CI by
 * scripts/check-dev-fixtures-excluded.mjs.
 */

const SURFACE = '[data-surface="instrument"]';
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
    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'ReefRadar fixtures' })).toBeVisible();
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
