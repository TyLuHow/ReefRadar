import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
const CONTRACT_SITES = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: { country: string; site_id: string }[];
  }
).sites;
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

test.describe('/dev/fixtures primitive sections (04-09)', () => {
  test('the five sections are listed and their cells carry markers', async ({ page }) => {
    await openFixtures(page);
    for (const slug of ['button', 'toggle-group', 'tooltip', 'states', 'numerals']) {
      await expect(page.locator(`section#${slug}`)).toHaveCount(1);
      expect(await page.locator(`section#${slug} [data-fixture-state]`).count()).toBeGreaterThan(0);
    }
  });

  test('forced hover, focus and pressed cells are labelled as forced', async ({ page }) => {
    await openFixtures(page);
    for (const slug of ['button', 'toggle-group']) {
      for (const state of ['hover', 'focus', 'pressed']) {
        const cell = page.locator(`section#${slug} [data-fixture-state="${state}"]`);
        await expect(cell).toContainText(`${state.toUpperCase()} (forced)`);
        await expect(cell).toContainText('State forced for review');
      }
    }
  });

  test('the numerals are computed from the contract sites', async ({ page }) => {
    await openFixtures(page);
    const stats = page.locator('section#numerals [data-fixture-state="stats"]');
    const siteCount = CONTRACT_SITES.length;
    const countryCount = new Set(CONTRACT_SITES.map((site) => site.country)).size;
    await expect(stats.locator('p.flex').nth(0)).toContainText(String(siteCount));
    await expect(stats.locator('p.flex').nth(0)).toContainText('reference sites');
    await expect(stats.locator('p.flex').nth(1)).toContainText(String(countryCount));
    await expect(stats.locator('p.flex').nth(1)).toContainText('countries');
  });

  test('the error cells show no request id and the long-wait cell says so', async ({ page }) => {
    await openFixtures(page);
    await expect(page.locator('section#states')).not.toContainText('Request id');
    await expect(page.locator('section#states [data-fixture-state="loading-long-wait"]')).toContainText('This is taking longer than usual.');
  });

  for (const direction of ['atlas', 'nocturne', 'poster']) {
    test(`one accent block per cell logs no error in ${direction}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('AccentBlock')) errors.push(message.text());
      });
      await openFixtures(page, `?direction=${direction}`);
      await expect(page.locator('section#numerals [data-accent-block]')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }

  test('the live tooltip opens on keyboard focus and closes on Escape', async ({ page }) => {
    await openFixtures(page);
    // The contract pin is filled by a client query, so once it reads the app has hydrated and the
    // tooltip's focus handlers are attached.
    await expect(page.getByTestId('contract-pin')).toHaveText(/^Contract v1/);
    // The two forced cells already draw a static tooltip each; the live one adds a third.
    await expect(page.getByRole('tooltip')).toHaveCount(2);
    // React Aria opens a tooltip on focus only when the focus came from the keyboard, so reach the
    // trigger with real Tab presses: focus the control before it, then Tab onto the trigger.
    await page.getByRole('button', { name: 'Reduced motion' }).focus();
    const trigger = page.getByTestId('tooltip-live-trigger');
    for (let presses = 0; presses < 200 && !(await trigger.evaluate((el) => el === document.activeElement)); presses += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(trigger).toBeFocused();
    // A tooltip closes when its page scrolls, and the first Tab onto a trigger that was off screen
    // scrolls it into view right after the tooltip opened. Step off and back on, now that the page
    // has settled, so the assertion is about the tooltip and not about that scroll.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(2);
  });
});

test.describe('/dev/fixtures overlays and listbox (04-10)', () => {
  const DIRECTION_LIST = ['atlas', 'nocturne', 'poster'] as const;
  const BAD_IMPACTS = new Set(['serious', 'critical']);

  /** The chrome only exists once the client has rendered (the Suspense fallback has none), so a press is never lost to hydration. */
  async function openReady(page: Page, query = '') {
    await openFixtures(page, query);
    await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  }

  test('the three sections are listed and their cells carry markers', async ({ page }) => {
    await openReady(page);
    for (const slug of ['dialog', 'sheet', 'listbox']) {
      await expect(page.locator(`section#${slug}`)).toHaveCount(1);
      expect(await page.locator(`section#${slug} [data-fixture-state]`).count()).toBeGreaterThan(0);
    }
    await expect(page.locator('section#listbox [data-fixture-state="hover"]')).toContainText('State forced for review');
    await expect(page.locator('section#listbox [data-fixture-state="disabled-item"]')).toContainText('State forced for review');
  });

  test('the live dialog traps focus, closes on Escape and returns focus to its trigger', async ({ page }) => {
    await openReady(page);
    const trigger = page.getByRole('button', { name: 'Open dialog' });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'About this dialog' });
    await expect(dialog).toBeVisible();
    // The overlay portals into the instrument surface, so it carries the surface's tokens.
    await expect(page.locator(SURFACE).getByRole('dialog')).toHaveCount(1);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('the alertdialog starts on the safe action and ignores a scrim press', async ({ page }) => {
    await openReady(page);
    const trigger = page.getByRole('button', { name: 'Open alert dialog' });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Discard this comparison?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep comparison' })).toBeFocused();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('a live sheet closes on Escape and on a scrim press, and focus returns to its trigger', async ({ page }) => {
    await openReady(page);
    const right = page.getByRole('button', { name: 'Open right sheet' });
    await right.scrollIntoViewIfNeeded();
    await right.click();
    const sheet = page.getByRole('dialog', { name: 'Right sheet' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(right).toBeFocused();

    const bottom = page.getByRole('button', { name: 'Open bottom sheet' });
    await bottom.click();
    const tray = page.getByRole('dialog', { name: 'Bottom sheet' });
    await expect(tray).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(tray).toHaveCount(0);
    await expect(bottom).toBeFocused();
  });

  test('the listbox moves with arrows, Home, End, PageDown and typeahead, and Enter selects', async ({ page }) => {
    await openReady(page);
    const list = page.getByRole('listbox', { name: 'Reference sites, all' });
    await list.scrollIntoViewIfNeeded();
    await list.focus();
    const options = list.getByRole('option');
    await expect(options.first()).toBeFocused();
    await expect(options.first()).toContainText(CONTRACT_SITES[0]?.site_id ?? '');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(options.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(options.first()).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect
      .poll(async () => options.evaluateAll((nodes) => nodes.indexOf(document.activeElement as HTMLElement)))
      .toBeGreaterThan(1);
    await page.keyboard.press('Home');
    // Typeahead: the id of the last site in the contract.
    const last = CONTRACT_SITES[CONTRACT_SITES.length - 1]?.site_id ?? '';
    expect(last).not.toBe('');
    await page.keyboard.type(last);
    const target = list.getByRole('option', { name: new RegExp(`^${last}\\b`) });
    await expect(target).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(target).toHaveAttribute('aria-selected', 'true');
  });

  test('below 1024 px the section list opens from a Sections button in a Sheet', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await openReady(page);
    const button = page.getByRole('button', { name: 'Sections' });
    await expect(button).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Fixture sections' })).toHaveCount(0);
    await button.click();
    const sheet = page.getByRole('dialog', { name: 'Sections' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Listbox' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/#listbox$/);
  });

  test('at 1024 px and up there is no Sections button and the list is a column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openReady(page);
    await expect(page.getByRole('button', { name: 'Sections' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Fixture sections' })).toBeVisible();
  });

  for (const direction of DIRECTION_LIST) {
    test(`an open dialog has a filled panel and a scrim in ${direction}`, async ({ page }) => {
      await openReady(page, `?direction=${direction}`);
      await page.getByRole('button', { name: 'Open dialog' }).click();
      const dialog = page.getByRole('dialog', { name: 'About this dialog' });
      await expect(dialog).toBeVisible();
      await expect
        .poll(async () =>
          dialog.evaluate((node) => {
            const modal = node.parentElement as HTMLElement;
            const scrim = modal.parentElement as HTMLElement;
            const panel = getComputedStyle(modal).backgroundColor;
            const veil = getComputedStyle(scrim).backgroundColor;
            return panel !== '' && panel !== 'rgba(0, 0, 0, 0)' && veil !== '' && veil !== 'rgba(0, 0, 0, 0)' && panel !== veil;
          }),
        )
        .toBe(true);
    });
  }

  test('under reduced motion the overlay transitions are zero length', async ({ page }) => {
    await openReady(page, '?reduced=1');
    await page.getByRole('button', { name: 'Open right sheet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Right sheet' });
    await expect(sheet).toBeVisible();
    await expect
      .poll(async () =>
        sheet.evaluate((node) => {
          const modal = node.parentElement as HTMLElement;
          const scrim = modal.parentElement as HTMLElement;
          const a = getComputedStyle(modal).transitionDuration;
          const b = getComputedStyle(scrim).transitionDuration;
          const zero = (value: string) => value !== '' && value.split(',').every((d) => d.trim() === '0s');
          return zero(a) && zero(b);
        }),
      )
      .toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  for (const direction of DIRECTION_LIST) {
    for (const slug of ['dialog', 'sheet', 'listbox']) {
      test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
        await page.goto(`/dev/fixtures/${slug}/?direction=${direction}`, { waitUntil: 'load' });
        await expect(page.locator(`section#${slug} [data-fixture-state]`).first()).toBeVisible();
        // The contract-backed cells settle once the data has arrived.
        await expect(page.locator(`section#${slug} [data-fixture-state$="-loading"]`)).toHaveCount(0);
        const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
        const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
        expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    }
  }

  test('axe: an open dialog and an open sheet have no serious or critical violation', async ({ page }) => {
    await openReady(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'About this dialog' })).toBeVisible();
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? '')).map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open bottom sheet' }).click();
    await expect(page.getByRole('dialog', { name: 'Bottom sheet' })).toBeVisible();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? '')).map((v) => v.id)).toEqual([]);
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
