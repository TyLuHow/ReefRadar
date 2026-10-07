import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { ensureMocked, openSection } from './support/fixtures';

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
  // ensureMocked records the page, so openSection does not install the mock a second time.
  await ensureMocked(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

async function openFixtures(page: Page, query = '') {
  const response = await page.goto(`/dev/fixtures/${query}`, { waitUntil: 'load' });
  await expect(page.locator(SURFACE)).toBeVisible();
  // [data-surface="instrument"] also exists in the Suspense fallback (an atlas-only, pre-hydration prerender with no
  // inline tokens), so every assertion about the surface would be vacuous against it. The Direction radiogroup exists
  // only in the hydrated surface (D-WR-01).
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  return response;
}

test.describe('/dev/fixtures', () => {
  test('serves 200, is noindex and has no legacy shell', async ({ page }) => {
    const response = await openFixtures(page);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // The legacy Navbar is absent; the only page navigation is the fixtures section list. (Each composition
    // carries its own "Primary" header navigation and attribution footer inside its section: 04-21.)
    await expect(page.locator('nav:not([aria-label="Primary"])')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Fixture sections' })).toBeVisible();
    await expect(page.locator('footer:not(section footer)')).toHaveCount(0);
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

    // A valid override beside the bad one is the positive control: once it is applied the parser has run, so the
    // bad token's absence is a decision and not the pre-hydration state.
    await openFixtures(page, '?tok=--dir-hab-healthy:%23B00020&tok=--dir-x:red');
    await expect
      .poll(() => page.locator(SURFACE).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--dir-hab-healthy')))
      .toBe('#B00020');
    const inline = await page.locator(SURFACE).evaluate((el) => (el as HTMLElement).getAttribute('style') ?? '');
    expect(inline).not.toContain('--dir-x');
    expect(inline).not.toContain('red');

    await openFixtures(page, '?tok=--dir-hab-healthy:%23B00020&tok=background:url(x)');
    await expect
      .poll(() => page.locator(SURFACE).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--dir-hab-healthy')))
      .toBe('#B00020');
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
    // Other tooltips share the page (the forced Tooltip cells, and the Listbox disabled-item cell,
    // which opens on hover), so a page-wide count is not about this trigger. Park the pointer where
    // the Tab sweep's scrolling cannot slide a hover target under it, and follow only the live
    // overlay: React Aria positions it (data-placement), the static review surfaces are not.
    await page.mouse.move(0, 0);
    const liveTip = page
      .locator('[role="tooltip"][data-placement]')
      .filter({ hasText: 'Assigned by the dataset authors, not by the model.' });
    await expect(liveTip).toHaveCount(0);
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
    await expect(liveTip).toHaveCount(1);
    await expect(liveTip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(liveTip).toHaveCount(0);
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
    // React Aria moves focus into the dialog on the next frame; the sweep and Escape are only meaningful once it has (D-WR-04).
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
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
    // The press blurs the focused action; React Aria puts focus back inside the dialog on the next
    // frame, and Escape is only heard once it has.
    await expect.poll(async () => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
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
    // Escape is only heard once focus is inside the overlay (D-WR-04).
    await expect.poll(() => sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
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
        // openSection waits for the hydrated chrome, every manifest cell and the settled wells, so axe never runs on the
        // atlas-only Suspense prerender (D-WR-02).
        test.setTimeout(90_000);
        await openSection(page, slug, { direction });
        await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
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

test.describe('/dev/fixtures slider, table and data table (04-11)', () => {
  const DIRECTION_LIST = ['atlas', 'nocturne', 'poster'] as const;
  const BAD_IMPACTS = new Set(['serious', 'critical']);
  const SITE_COUNT = CONTRACT_SITES.length;

  /** The chrome only exists once the client has rendered (the Suspense fallback has none), so a press is never lost to hydration. */
  async function openReady(page: Page, query = '') {
    await openFixtures(page, query);
    await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  }

  const cell = (page: Page, slug: string, state: string) => page.locator(`section#${slug} [data-fixture-state="${state}"]`);
  const thumbOf = (page: Page) =>
    cell(page, 'slider', 'default')
      .getByRole('slider', { name: 'Playback position' })
      .locator('xpath=ancestor::div[contains(@class,"size-5")][1]');

  test('the three sections are listed and their cells carry markers', async ({ page }) => {
    await openReady(page);
    for (const slug of ['table', 'slider', 'data-table']) {
      await expect(page.locator(`section#${slug}`)).toHaveCount(1);
      expect(await page.locator(`section#${slug} [data-fixture-state]`).count()).toBeGreaterThan(0);
    }
    for (const [slug, state] of [
      ['slider', 'hover'],
      ['slider', 'focus'],
      ['slider', 'pressed'],
      ['table', 'hover-row'],
      ['data-table', 'hover'],
      ['data-table', 'disabled-row'],
    ] as const) {
      await expect(cell(page, slug, state)).toContainText('State forced for review');
    }
  });

  test('the data table lists every contract site with computed counts', async ({ page }) => {
    await openReady(page);
    const live = cell(page, 'data-table', 'default');
    await expect(live.getByRole('row')).toHaveCount(SITE_COUNT + 1);
    await expect(live).toContainText(`${SITE_COUNT} sites`);
    await expect(live).toContainText(`Showing ${SITE_COUNT} of ${SITE_COUNT} sites`);
    await expect(cell(page, 'data-table', 'one-row')).toContainText(`Showing 1 of ${SITE_COUNT} sites`);
    await expect(cell(page, 'data-table', 'one-row').getByRole('row')).toHaveCount(2);
  });

  test('the slider moves by step and by ten steps, jumps to the ends and the range thumbs cannot cross', async ({ page }) => {
    await openReady(page);
    const live = cell(page, 'slider', 'default');
    const position = live.getByRole('slider', { name: 'Playback position' });
    await position.scrollIntoViewIfNeeded();
    await position.focus();
    await expect(position).toHaveValue('12');
    await expect(position).toHaveAttribute('aria-valuetext', '0:12 of 0:30');
    await page.keyboard.press('ArrowRight');
    await expect(position).toHaveValue('12.1');
    await page.keyboard.press('PageUp');
    await expect(position).toHaveValue('13.1');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(position).toHaveValue('11.1');
    await page.keyboard.press('End');
    await expect(position).toHaveValue('30');
    await expect(position).toHaveAttribute('aria-valuetext', '0:30 of 0:30');
    await page.keyboard.press('Home');
    await expect(position).toHaveValue('0');

    const minimum = live.getByRole('slider', { name: 'Frequency range minimum' });
    const maximum = live.getByRole('slider', { name: 'Frequency range maximum' });
    await expect(minimum).toHaveAttribute('aria-valuetext', '2,000 Hz');
    await expect(maximum).toHaveAttribute('aria-valuetext', '6,000 Hz');
    await minimum.focus();
    await page.keyboard.press('PageUp');
    await expect(minimum).toHaveValue('3000');
    await page.keyboard.press('End');
    await expect(minimum).toHaveValue('6000');
    await expect(maximum).toHaveValue('6000');
    await page.keyboard.press('Tab');
    await expect(maximum).toBeFocused();
    await page.keyboard.press('Home');
    await expect(maximum).toHaveValue('6000');
  });

  test('the base table is one tab stop, rows move with the arrows, Space selects and a header sorts', async ({ page }) => {
    await openReady(page);
    const grid = cell(page, 'table', 'default').getByRole('grid');
    await grid.scrollIntoViewIfNeeded();
    const rows = grid.getByRole('row');
    const country = grid.getByRole('columnheader', { name: 'Country' });
    await expect(country).not.toHaveAttribute('aria-sort', /ascending|descending/);
    await country.focus();
    await page.keyboard.press('Enter');
    await expect(country).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Space');
    await expect(country).toHaveAttribute('aria-sort', 'descending');
    // From a header the Down arrow enters the cell below it; rows are reached directly and the
    // arrow keys then move from row to row.
    await rows.nth(1).focus();
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
    // One tab stop: Tab leaves the grid.
    await page.keyboard.press('Tab');
    expect(await grid.evaluate((node) => node.contains(document.activeElement))).toBe(false);
  });

  test('the data table runs the row action on Enter, selects on Space and sorts on the Site header', async ({ page }) => {
    await openReady(page);
    const live = cell(page, 'data-table', 'default');
    const grid = live.getByRole('grid');
    await grid.scrollIntoViewIfNeeded();
    const site = grid.getByRole('columnheader', { name: 'Site' });
    await expect(site).toHaveAttribute('aria-sort', 'ascending');
    await site.focus();
    await page.keyboard.press('Enter');
    await expect(site).toHaveAttribute('aria-sort', 'descending');
    await page.keyboard.press('Enter');
    await expect(site).toHaveAttribute('aria-sort', 'ascending');

    const first = grid.getByRole('row').nth(1);
    await first.focus();
    await expect(first).toBeFocused();
    const firstId = ((await first.getByRole('rowheader').textContent()) ?? '').trim();
    expect(firstId).not.toBe('');
    await page.keyboard.press('Enter');
    await expect(live.getByTestId('row-action')).toHaveText(`Row action: open ${firstId}.`);
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-selected', 'true');
  });

  test('on a phone-width container the table is a focusable labelled region with a pinned first column', async ({ page }) => {
    await openReady(page);
    const phone = cell(page, 'data-table', 'phone-scroll');
    const region = phone.getByRole('region', { name: 'Reference sites, phone, scrollable' });
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveAttribute('tabindex', '0');
    await region.focus();
    await expect(region).toBeFocused();
    expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await region.evaluate((node) => {
      node.scrollLeft = 160;
    });
    await expect
      .poll(async () =>
        region.evaluate((node) => {
          const pinned = node.querySelector('tbody td') as HTMLElement;
          const edge = node.getBoundingClientRect().left;
          return {
            sticky: getComputedStyle(pinned).position,
            pinned: Math.abs(pinned.getBoundingClientRect().left - edge) < 2,
          };
        }),
      )
      .toEqual({ sticky: 'sticky', pinned: true });
  });

  test('a wide data table has no scroll region', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReady(page);
    await expect(cell(page, 'data-table', 'default').getByRole('grid')).toBeVisible();
    await expect(cell(page, 'data-table', 'default').getByRole('region')).toHaveCount(0);
  });

  test('long text wraps inside its cell and is never cut with an ellipsis', async ({ page }) => {
    await openReady(page);
    const long = cell(page, 'data-table', 'long-text');
    await long.scrollIntoViewIfNeeded();
    await expect(long.getByRole('row')).toHaveCount(5);
    const verdict = await long.evaluate((node) =>
      Array.from(node.querySelectorAll('td')).every((td) => {
        const style = getComputedStyle(td);
        return style.textOverflow !== 'ellipsis' && style.whiteSpace !== 'nowrap' && td.scrollWidth <= td.clientWidth + 1;
      }),
    );
    expect(verdict).toBe(true);
  });

  test('under reduced motion the slider thumb transition is zero length', async ({ page }) => {
    await openReady(page, '?reduced=1');
    await expect.poll(async () => thumbOf(page).evaluate((node) => getComputedStyle(node).transitionDuration)).toMatch(/^0s(, 0s)*$/);
  });

  for (const direction of DIRECTION_LIST) {
    test(`the pinned first column and the thumbs are filled in ${direction}`, async ({ page }) => {
      await openReady(page, `?direction=${direction}`);
      const grid = cell(page, 'data-table', 'default').getByRole('grid');
      await expect
        .poll(async () =>
          grid.evaluate((node) => {
            const pinned = getComputedStyle(node.querySelector('tbody td') as HTMLElement).backgroundColor;
            return pinned !== '' && pinned !== 'rgba(0, 0, 0, 0)';
          }),
        )
        .toBe(true);
      await expect
        .poll(async () => thumbOf(page).evaluate((node) => getComputedStyle(node).backgroundColor))
        .not.toMatch(/rgba\(0, 0, 0, 0\)|^$/);
    });
  }

  for (const direction of DIRECTION_LIST) {
    for (const slug of ['table', 'slider', 'data-table']) {
      test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
        // openSection waits for the hydrated chrome, every manifest cell and the settled wells, so axe never runs on the
        // atlas-only Suspense prerender (D-WR-02).
        test.setTimeout(90_000);
        await openSection(page, slug, { direction });
        await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
        // The phone cell measures its container before the region attributes exist.
        if (slug === 'data-table') {
          await expect(cell(page, slug, 'phone-scroll').getByRole('region')).toHaveCount(1);
        }
        const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
        const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
        expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    }
  }
});

test.describe('/dev/fixtures command palette and provenance (04-12)', () => {
  const DIRECTION_LIST = ['atlas', 'nocturne', 'poster'] as const;
  const BAD_IMPACTS = new Set(['serious', 'critical']);
  // Heavy top rule width per direction (tokens.css --rule-w-heavy): the Why panel's top border.
  const HEAVY_RULE_PX = { atlas: 3, nocturne: 1, poster: 6 } as const;

  interface FullSite {
    site_id: string;
    label_assigned_by: string;
    label_definition: string | null;
    dataset_url: string;
    doi: string | null;
    doi_note: string | null;
    licence_url: string | null;
  }
  const SITE_DATA = (
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
      sites: FullSite[];
    }
  ).sites;
  // tests/e2e -> tests -> dashboard-next: the audio manifest the clips group is built from.
  const CLIP_IDS = (
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'audio-manifest.json'), 'utf8')) as {
      excerpts: { excerpt_id: string }[];
    }
  ).excerpts.map((excerpt) => excerpt.excerpt_id);
  const METHOD_NAMES = ['Model card', 'Frequency bands', 'Datasets', 'Limitations'];
  const PALETTE_TITLES = [...SITE_DATA.map((site) => site.site_id), ...CLIP_IDS, ...METHOD_NAMES];
  const matches = (query: string) => PALETTE_TITLES.filter((title) => title.toLowerCase().includes(query.toLowerCase())).length;

  const IND_H1 = SITE_DATA.find((site) => site.site_id === 'ind_H1') as FullSite;
  const NULL_DOI = SITE_DATA.find((site) => site.doi === null) as FullSite;
  const LONGEST = SITE_DATA.reduce((best, site) => ((site.label_definition?.length ?? 0) > (best.label_definition?.length ?? 0) ? site : best), SITE_DATA[0]);

  /** The chrome only exists once the client has rendered (the Suspense fallback has none), so a press is never lost to hydration. */
  async function openReady(page: Page, query = '') {
    await openFixtures(page, query);
    await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  }

  const cell = (page: Page, slug: string, state: string) => page.locator(`section#${slug} [data-fixture-state="${state}"]`);
  const paletteOf = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
  const chipOf = (page: Page, kind: string) => cell(page, 'provenance', 'default').locator(`button[data-kind="${kind}"]`);
  const valueOf = (root: ReturnType<Page['locator']>, term: string) =>
    root.locator('dt', { hasText: new RegExp(`^${term}$`) }).locator('xpath=following-sibling::dd[1]');

  test('both sections are listed and their cells carry markers', async ({ page }) => {
    await openReady(page);
    for (const slug of ['command-palette', 'provenance']) {
      await expect(page.locator(`section#${slug}`)).toHaveCount(1);
      expect(await page.locator(`section#${slug} [data-fixture-state]`).count()).toBeGreaterThan(0);
    }
    for (const state of ['hover', 'focus', 'pressed']) {
      await expect(cell(page, 'provenance', state)).toContainText('State forced for review');
    }
  });

  test('Ctrl+K opens the palette, typing filters and counts, arrows move, Enter runs and closes', async ({ page }) => {
    await openReady(page);
    await page.keyboard.press('Control+k');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    // The overlay portals into the instrument surface, so it carries the surface's tokens.
    await expect(page.locator(SURFACE).getByRole('dialog', { name: 'Command palette' })).toHaveCount(1);
    const input = dialog.getByRole('searchbox', { name: 'Search' });
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('status')).toHaveText(`${PALETTE_TITLES.length} results`);

    await page.keyboard.type('ind_h');
    const expected = matches('ind_h');
    await expect(dialog.getByRole('option')).toHaveCount(expected);
    await expect(dialog.getByRole('status')).toHaveText(`${expected} results`);

    await expect.poll(async () => input.getAttribute('aria-activedescendant')).toBeTruthy();
    const first = await input.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => input.getAttribute('aria-activedescendant')).not.toBe(first);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(cell(page, 'command-palette', 'closed').getByTestId('palette-action')).toHaveText(/Result run: (site|clip):/);
  });

  test('Cmd+K opens it too', async ({ page }) => {
    await openReady(page);
    await page.keyboard.press('Meta+k');
    await expect(paletteOf(page)).toBeVisible();
  });

  test('the button opens it, Escape closes it in one press and focus returns to the button', async ({ page }) => {
    await openReady(page);
    const opener = cell(page, 'command-palette', 'closed').getByRole('button', { name: 'Open command palette' });
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    await page.keyboard.type('ken');
    await expect(dialog.getByRole('searchbox', { name: 'Search' })).toHaveValue('ken');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a query with no match says so and announces 0 results', async ({ page }) => {
    await openReady(page);
    await page.keyboard.press('Control+k');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    // Typed characters are lost if the search input is not yet focused (D-WR-04).
    await expect(dialog.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    await page.keyboard.type('zzz');
    await expect(dialog.getByText('No results for “zzz”.')).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('0 results');
  });

  test('the result list scrolls inside a panel capped at 70dvh', async ({ page }) => {
    await openReady(page);
    await page.keyboard.press('Control+k');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('listbox').getByRole('option').first()).toBeVisible();
    // The scroll container is a focusable, labelled region once the list overflows.
    const region = dialog.getByRole('region', { name: 'Results, scrollable' });
    await expect(region).toHaveCount(1);
    const verdict = await region.evaluate((node) => {
      const panel = node.closest('[role="dialog"]')?.parentElement as HTMLElement;
      return {
        scrolls: node.scrollHeight > node.clientHeight + 1,
        overflowY: getComputedStyle(node).overflowY,
        panel: panel.getBoundingClientRect().height,
        cap: window.innerHeight * 0.7,
      };
    });
    expect(verdict.scrolls).toBe(true);
    expect(verdict.overflowY).toBe('auto');
    expect(verdict.panel).toBeLessThanOrEqual(verdict.cap + 1);
  });

  test('the arrow keys keep the active result inside the scrolling list', async ({ page }) => {
    await openReady(page);
    await page.keyboard.press('Control+k');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('searchbox', { name: 'Search' });
    await expect(input).toBeFocused();
    // React Aria wires the list to the input and moves the virtual focus on later frames: a key pressed
    // before that is lost, so each key is repeated until the active result has moved, then the next.
    await expect(dialog.getByRole('option').first()).toBeVisible();
    let previous = await input.getAttribute('aria-activedescendant');
    for (let i = 0; i < 40; i += 1) {
      const before = previous;
      await expect
        .poll(async () => {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(50);
          return input.getAttribute('aria-activedescendant');
        })
        .not.toBe(before);
      previous = await input.getAttribute('aria-activedescendant');
    }
    await expect
      .poll(async () =>
        input.evaluate((node) => {
          const id = node.getAttribute('aria-activedescendant');
          const active = id ? document.getElementById(id) : null;
          const region = node.closest('[role="dialog"]')?.querySelector('[data-results-scroll]') as HTMLElement | null;
          if (!active || !region) return false;
          const a = active.getBoundingClientRect();
          const r = region.getBoundingClientRect();
          return a.top >= r.top - 1 && a.bottom <= r.bottom + 1;
        }),
      )
      .toBe(true);
  });

  test('the static cells show computed counts, the no-results text and the loading and error states', async ({ page }) => {
    await openReady(page);
    const results = cell(page, 'command-palette', 'results');
    await results.scrollIntoViewIfNeeded();
    await expect(results.getByRole('option')).toHaveCount(matches('ind'));
    await expect(results.getByRole('status')).toHaveText(`${matches('ind')} results`);
    await expect(cell(page, 'command-palette', 'no-results')).toContainText('No results for “zzz”.');
    await expect(cell(page, 'command-palette', 'no-results').getByRole('status')).toHaveText('0 results');
    await expect(cell(page, 'command-palette', 'open-empty-query').getByRole('option')).toHaveCount(PALETTE_TITLES.length);
    await expect(cell(page, 'command-palette', 'loading')).toContainText('Loading search…');
    await expect(cell(page, 'command-palette', 'error')).toContainText('Search is unavailable.');
    await expect(cell(page, 'command-palette', 'error')).toContainText('Reload the page to try again.');
  });

  test('the label chip opens the Why panel with the contract fields, and Escape returns focus to the chip', async ({ page }) => {
    await openReady(page);
    const chip = chipOf(page, 'label');
    await chip.scrollIntoViewIfNeeded();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await chip.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: 'Where this label comes from' });
    await expect(panel).toBeVisible();
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('dt')).toHaveText([
      'Assigned by',
      'Definition',
      'Dataset',
      'DOI',
      'Licence',
      'Dataset version',
      'Model version',
      'Recorded',
    ]);
    await expect(valueOf(panel, 'Assigned by')).toHaveText(IND_H1.label_assigned_by);
    await expect(valueOf(panel, 'Definition')).toHaveText(`“${IND_H1.label_definition}”`);
    await expect(valueOf(panel, 'Model version')).toHaveText(MODEL_VERSION);
    await expect(valueOf(panel, 'Recorded')).toContainText('(recorder clock), timezone unverified');
    await expect(valueOf(panel, 'DOI').getByRole('link')).toHaveAttribute('href', `https://doi.org/${IND_H1.doi}`);
    await expect(valueOf(panel, 'Dataset').getByRole('link')).toHaveAttribute('href', IND_H1.dataset_url);
    await expect(valueOf(panel, 'Licence').getByRole('link')).toHaveAttribute('href', IND_H1.licence_url as string);
    await expect(panel.getByRole('link', { name: 'Methods and limits' })).toHaveAttribute('href', '/about/');
    // Every link in the panel is https or a path on this site.
    const hrefs = await panel.locator('a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    expect(hrefs.every((href) => href.startsWith('https://') || href.startsWith('/'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(chip).toBeFocused();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  test('the chip is 28 px high with a 44 px hit area', async ({ page }) => {
    await openReady(page);
    const chip = chipOf(page, 'source');
    await chip.scrollIntoViewIfNeeded();
    const verdict = await chip.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      inset: getComputedStyle(node, '::after').top,
      marked: node.hasAttribute('data-hit-expanded'),
    }));
    expect(Math.round(verdict.height)).toBe(28);
    expect(verdict.inset).toBe('-9px');
    expect(verdict.marked).toBe(true);
  });

  for (const direction of DIRECTION_LIST) {
    test(`the Why panel has a 1 px ink border and a heavy top rule in ${direction}`, async ({ page }) => {
      await openReady(page, `?direction=${direction}`);
      const chip = chipOf(page, 'source');
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      const panel = page.getByRole('dialog', { name: 'Source of this recording' });
      await expect(panel).toBeVisible();
      await expect
        .poll(async () =>
          panel.evaluate((node) => {
            const frame = node.closest('[data-placement]') as HTMLElement;
            const style = getComputedStyle(frame);
            return { top: style.borderTopWidth, left: style.borderLeftWidth, placed: frame.getAttribute('data-placement') !== null };
          }),
        )
        .toEqual({ top: `${HEAVY_RULE_PX[direction]}px`, left: '1px', placed: true });
    });
  }

  test('a missing DOI keeps its row and shows "Not recorded" with the stored reason', async ({ page }) => {
    await openReady(page);
    const surface = cell(page, 'provenance', 'missing').locator('[data-why-panel-surface]');
    await surface.scrollIntoViewIfNeeded();
    const doi = valueOf(surface, 'DOI');
    await expect(doi).toContainText('Not recorded');
    await expect(doi).toContainText(NULL_DOI.doi_note as string);
    await expect(doi.getByRole('link')).toHaveCount(0);
  });

  test('the empty cell is the missing kind: a dashed chip that says the source is not recorded', async ({ page }) => {
    await openReady(page);
    const chip = cell(page, 'provenance', 'empty').locator('button[data-kind="missing"]');
    await expect(chip).toHaveText('Source not recorded');
    await expect.poll(async () => chip.evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('dashed');
  });

  test('long definitions wrap inside the panel and are never cut with an ellipsis', async ({ page }) => {
    await openReady(page);
    const surface = cell(page, 'provenance', 'long-text').locator('[data-why-panel-surface]');
    await surface.scrollIntoViewIfNeeded();
    await expect(valueOf(surface, 'Definition')).toHaveText(`“${LONGEST.label_definition}”`);
    const verdict = await surface.evaluate((node) =>
      Array.from(node.querySelectorAll('dd')).every((dd) => {
        const style = getComputedStyle(dd);
        return style.textOverflow !== 'ellipsis' && style.whiteSpace !== 'nowrap' && dd.scrollWidth <= dd.clientWidth + 1;
      }),
    );
    expect(verdict).toBe(true);
  });

  test('on a phone the panel opens as a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReady(page);
    const chip = chipOf(page, 'label');
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    const sheet = page.getByRole('dialog', { name: 'Where this label comes from' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box === null ? null : { width: Math.round(box.width), bottom: Math.round(box.y + box.height) };
      })
      .toEqual({ width: 390, bottom: 844 });
    await expect.poll(() => sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(chip).toBeFocused();
  });

  for (const direction of DIRECTION_LIST) {
    for (const slug of ['command-palette', 'provenance']) {
      test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
        // openSection waits for the hydrated chrome, every manifest cell and the settled wells, so axe never runs on the
        // atlas-only Suspense prerender (D-WR-02).
        test.setTimeout(90_000);
        await openSection(page, slug, { direction });
        await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
        const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
        const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
        expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    }
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

// 04-18
test.describe('/dev/fixtures probability bar, legend and status band (04-18)', () => {
  const DIRECTION_LIST = ['atlas', 'nocturne', 'poster'] as const;
  const BAD_IMPACTS = new Set(['serious', 'critical']);
  const STATUS_ORDER = ['degraded', 'restored_early', 'restored_mid', 'healthy', 'unknown'] as const;
  const STATUS_WORD: Record<string, string> = {
    degraded: 'Degraded',
    restored_early: 'Restored (early)',
    restored_mid: 'Restored (mid)',
    healthy: 'Healthy',
    unknown: 'Unknown',
  };
  // The published contract sites, read from disk: the page must show these counts, computed.
  const SITES = (
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
      sites: { country: string; site_id: string; status: string }[];
    }
  ).sites;
  const CAPTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'api', 'visualize-ind_H1-captured.json'), 'utf8')) as {
    analysis_id: string;
    _capture: { captured_at: string };
  };
  const countOf = (status: string) => SITES.filter((site) => site.status === status).length;

  /** The chrome only exists once the client has rendered, so a press is never lost to hydration. */
  async function openReady(page: Page, query = '') {
    await openFixtures(page, query);
    await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  }

  const cell = (page: Page, slug: string, state: string) => page.locator(`section#${slug} [data-fixture-state="${state}"]`);

  test('the three sections are listed, their cells carry markers and forced cells say so', async ({ page }) => {
    await openReady(page);
    for (const slug of ['probability-bar', 'legend', 'status-band']) {
      await expect(page.locator(`section#${slug}`)).toHaveCount(1);
      await expect(page.locator(`section#${slug} [data-fixture-state]`).first()).toBeVisible();
    }
    await expect(cell(page, 'probability-bar', 'abstain')).toContainText('State forced for review');
    await expect(cell(page, 'status-band', 'hover')).toContainText('State forced for review');
    await expect(cell(page, 'probability-bar', 'default')).not.toContainText('State forced for review');
  });

  test('the default probability bar is the captured ind_H1 reading beside its reference label', async ({ page }) => {
    await openReady(page);
    const bar = cell(page, 'probability-bar', 'default');
    const group = bar.getByRole('group', { name: 'Model reading: class probabilities' });
    await expect(group).toBeVisible();
    // Largest-remainder integer percentages of the captured probabilities (0.955584, 0.035958, 0.008458).
    await expect(group.locator('[data-class="degraded"]')).toHaveText('Degraded95%');
    await expect(group.locator('[data-class="healthy"]')).toHaveText('Healthy4%');
    await expect(group.locator('[data-class="restored_early"]')).toHaveText('Restored (early)1%');
    await expect(bar).toContainText("The model's highest probability, Degraded, differs from the reference label, Healthy.");
    await expect(bar).toContainText('Reference label: Healthy, assigned by MARRS research team');
    await expect(bar).toContainText(`One-time read-only capture of the live analysis, ${CAPTURE._capture.captured_at.slice(0, 10)}.`);
    await expect(bar).toContainText('It has not been tested on recordings from new sites.');
    await expect
      .poll(async () => {
        const values = await group.locator('[data-percent]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-percent'))));
        return values.reduce((sum, value) => sum + value, 0);
      })
      .toBe(100);
  });

  test('the agree cell is the stamped test fixture and says so', async ({ page }) => {
    await openReady(page);
    const bar = cell(page, 'probability-bar', 'agree');
    await expect(bar.locator('[data-class="healthy"]')).toHaveText('Healthy58%');
    await expect(bar).toContainText("The model's highest probability, Healthy, matches the reference label.");
    await expect(bar).toContainText('Test fixture, not a real analysis.');
  });

  test('abstain says "Can\'t tell" with neutral hatched bars and no class colour', async ({ page }) => {
    await openReady(page);
    const bar = cell(page, 'probability-bar', 'abstain');
    await expect(bar.getByRole('heading', { name: "Can't tell" })).toBeVisible();
    await expect(bar).toContainText('The model withheld a reading for this recording.');
    // The interim model has no abstain threshold, so the threshold sentence is absent.
    await expect(bar).not.toContainText('No class reached');
    await expect
      .poll(async () => bar.locator('[data-bar-fill]').evaluateAll((nodes) => nodes.every((node) => node.getAttribute('data-hatched') === 'true' && !/hab-/.test(node.className))))
      .toBe(true);
    await expect(bar.locator('svg[data-shape="ring"]')).toHaveCount(1);
    await expect(bar.locator('svg[data-shape="circle"], svg[data-shape="down-triangle"], svg[data-shape="diamond"]')).toHaveCount(0);
  });

  test('the loading, empty and error cells use the UI-SPEC copy', async ({ page }) => {
    await openReady(page);
    await expect(cell(page, 'probability-bar', 'loading')).toContainText('Loading model reading…');
    await expect(cell(page, 'probability-bar', 'empty')).toContainText('A reading appears after the recording has been analysed.');
    await expect(cell(page, 'probability-bar', 'error')).toContainText('The recording and its reference label are unaffected.');
  });

  test('the static legend shows the contract counts in ordinal order', async ({ page }) => {
    await openReady(page);
    const legend = cell(page, 'legend', 'static');
    await expect(legend).toContainText(`${SITES.length} sites shown`);
    for (const status of STATUS_ORDER) {
      await expect(legend.locator(`[data-legend-row="${status}"]`)).toHaveText(`${STATUS_WORD[status]} ${countOf(status)}`);
    }
    await expect
      .poll(async () => legend.locator('[data-legend-row]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-legend-row'))))
      .toEqual([...STATUS_ORDER]);
  });

  test('the evidence cell lists acoustic references and location-only sites', async ({ page }) => {
    await openReady(page);
    const evidence = cell(page, 'legend', 'with-evidence');
    await expect(evidence.getByText('Evidence', { exact: true })).toBeVisible();
    await expect(evidence.getByText(/^Acoustic reference \d+$/)).toBeVisible();
    await expect(evidence.getByText(/^Location only \d+$/)).toBeVisible();
  });

  test('the interactive legend disables a computed zero row and toggles the others', async ({ page }) => {
    await openReady(page);
    const legend = cell(page, 'legend', 'interactive');
    const group = legend.getByRole('toolbar', { name: 'Filter by habitat status' });
    await expect(group).toBeVisible();
    // At least one status has no site under the country filter: its row is disabled and still reads 0.
    await expect(group.locator('[data-legend-row][disabled]').first()).toHaveText(/ 0$/);
    const enabled = group.locator('[data-legend-row]:not([disabled])').first();
    await expect(enabled).toHaveAttribute('aria-pressed', 'false');
    await enabled.click();
    await expect(enabled).toHaveAttribute('aria-pressed', 'true');
    await enabled.click();
    await expect(enabled).toHaveAttribute('aria-pressed', 'false');
  });

  test('the selected legend cell has one row pressed and every row at least 44 px high', async ({ page }) => {
    await openReady(page);
    const legend = cell(page, 'legend', 'selected');
    await expect(legend.locator('[data-legend-row][aria-pressed="true"]')).toHaveCount(1);
    await expect
      .poll(async () => legend.locator('[data-legend-row]').evaluateAll((nodes) => nodes.every((node) => node.getBoundingClientRect().height >= 44)))
      .toBe(true);
  });

  test('the status band sizes each segment by its computed count', async ({ page }) => {
    await openReady(page);
    const band = cell(page, 'status-band', 'default').getByRole('group', { name: 'Sites by habitat status' });
    for (const status of STATUS_ORDER) {
      const segment = band.locator(`[data-segment="${status}"]`);
      await expect(segment).toHaveAttribute('aria-label', `${STATUS_WORD[status]}: ${countOf(status)} sites`);
      await expect.poll(async () => segment.evaluate((node) => getComputedStyle(node).flexGrow)).toBe(String(countOf(status)));
    }
    await expect(band).toBeVisible();
  });

  test('the status band labels sit under their segments at width and in a grid in a phone container', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openReady(page);
    const labelsOf = (state: string) => cell(page, 'status-band', state).locator('[data-band-labels]');
    await expect.poll(async () => labelsOf('default').evaluate((node) => getComputedStyle(node).display)).toBe('flex');
    await expect.poll(async () => labelsOf('phone').evaluate((node) => getComputedStyle(node).display)).toBe('grid');
    await expect.poll(async () => cell(page, 'status-band', 'phone').locator('[data-band-labels]').evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  });

  test('the interactive status band toggles a segment and the selected cell starts with one on', async ({ page }) => {
    await openReady(page);
    const band = cell(page, 'status-band', 'selected').getByRole('toolbar', { name: 'Sites by habitat status' });
    await expect(band.getByRole('button', { name: `Healthy: ${countOf('healthy')} sites` })).toHaveAttribute('aria-pressed', 'true');
    const degraded = band.getByRole('button', { name: `Degraded: ${countOf('degraded')} sites` });
    await expect(degraded).toHaveAttribute('aria-pressed', 'false');
    await degraded.click();
    await expect(degraded).toHaveAttribute('aria-pressed', 'true');
  });

  for (const direction of DIRECTION_LIST) {
    for (const slug of ['probability-bar', 'legend', 'status-band']) {
      test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
        // openSection waits for the hydrated chrome, every manifest cell and the settled wells, so axe never runs on the
        // atlas-only Suspense prerender (D-WR-02).
        test.setTimeout(90_000);
        await openSection(page, slug, { direction });
        await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
        await expect(page.locator(`section#${slug} [data-fixture-state="${slug === 'probability-bar' ? 'abstain' : slug === 'legend' ? 'with-evidence' : 'phone'}"]`)).toBeVisible();
        const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
        const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
        expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    }
  }
});

// 04-19: StripPlot (strip, paired, scatter) on real contract and audio data.
test.describe('/dev/fixtures StripPlot (04-19)', () => {
  const STRIP = 'section#strip-plot';
  const DIRECTIONS_19 = ['atlas', 'nocturne', 'poster'] as const;
  const BAD_19 = new Set(['serious', 'critical']);

  async function openStripPlot(page: Page, direction = 'atlas') {
    await page.goto(`/dev/fixtures/strip-plot/?direction=${direction}`, { waitUntil: 'load' });
    await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
    // The band levels are computed from the two real WAVs, so the paired cell settles last.
    for (const state of ['default', 'paired', 'scatter']) {
      await expect(page.locator(`${STRIP} [data-fixture-state="${state}"] svg`)).toBeVisible({ timeout: 30_000 });
    }
  }

  test('the table discloses from the keyboard and lists every plotted site', async ({ page }) => {
    await openStripPlot(page);
    const cell = page.locator(`${STRIP} [data-fixture-state="default"]`);
    await cell.getByRole('button', { name: 'Show as table' }).focus();
    await page.keyboard.press('Enter');
    await expect(cell.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => {
        const caption = await cell.locator('figcaption').innerText();
        const n = Number(/for (\d+) reference sites/.exec(caption)?.[1]);
        return n > 0 && (await cell.getByRole('row').count()) === n + 1;
      })
      .toBe(true);
  });

  test('marks are not focusable and the scatter prints its computed caveat with one accent ring', async ({ page }) => {
    await openStripPlot(page);
    await expect(page.locator(`${STRIP} svg [tabindex]`)).toHaveCount(0);
    const scatter = page.locator(`${STRIP} [data-fixture-state="scatter"]`);
    await expect(scatter.getByText(/^The plane shows \d+% of the variation, so near here does not mean similar in sound\.$/)).toBeVisible();
    await expect(scatter.locator('svg g[stroke="var(--dir-accent)"] circle')).toHaveCount(1);
    // The accent never fills a mark in any variant.
    await expect(page.locator(`${STRIP} svg [fill="var(--dir-accent)"]`)).toHaveCount(0);
  });

  test('a selectable strip follows a table Select button', async ({ page }) => {
    await openStripPlot(page);
    const cell = page.locator(`${STRIP} [data-fixture-state="selected"]`);
    await cell.getByRole('button', { name: 'Show as table' }).click();
    await cell.getByRole('button', { name: 'Select aus_D1' }).click();
    await expect(cell.getByTestId('strip-plot-selected')).toHaveText('Selected: aus_D1');
  });

  for (const direction of DIRECTIONS_19) {
    test(`axe: strip-plot has no serious or critical violation in ${direction}`, async ({ page }) => {
      await openStripPlot(page, direction);
      const results = await new AxeBuilder({ page }).include(STRIP).analyze();
      const bad = results.violations.filter((v) => BAD_19.has(v.impact ?? ''));
      expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});
