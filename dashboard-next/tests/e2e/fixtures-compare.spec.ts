import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * CompareRow, CompareDeck and ClipCard on /dev/fixtures (04-16, DS-05, DS-06).
 *
 * The live compare cell plays the real committed ind_H1 (A, healthy) and ind_D1 (B, degraded)
 * excerpts, 30 s each. Canvases, React Aria and the clock settle on the next frame, so every spec
 * waits for both wells' data-ready and the Transport's status before it presses anything, scopes every
 * locator to one state cell (the page holds many decks), and polls anything that animates. Headless
 * Chromium has no listener: the specs assert transport state, the readout and the gains' visible
 * effects (the dim), not audible output.
 */

const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
const BAD_IMPACTS = new Set(['serious', 'critical']);
const START = '00:00.0 / 00:30.0';
const NINE = [
  'aus_D1',
  'aus_H1',
  'aus_H2',
  'aus_R1',
  'ind_D1',
  'ind_H1',
  'ind_N1',
  'ind_R1',
  'mex_R1',
];

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const cell = (page: Page, slug: string, state: string) => page.locator(`section#${slug} [data-fixture-state="${state}"]`);
const row = (c: Locator, slot: string) => c.locator(`[data-compare-row][data-slot="${slot}"]`);

async function open(page: Page, slug: string, query = '') {
  await page.goto(`/dev/fixtures/${slug}/${query}`, { waitUntil: 'load' });
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
}

/** The live compare deck, once both real clips have loaded and the controls are ready. */
async function openLiveDeck(page: Page, query = '') {
  await open(page, 'compare', query);
  const live = cell(page, 'compare', 'default');
  await expect(live.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(2);
  const group = live.getByRole('group', { name: 'Playback', exact: true });
  await expect(group).toHaveAttribute('data-transport-status', 'idle');
  const slider = live.getByRole('slider', { name: 'Mix between A and B' });
  return { live, group, slider, readout: group.getByTestId('transport-readout') };
}

const opacityOf = (c: Locator, slot: string) => row(c, slot).locator('canvas').evaluate((el) => getComputedStyle(el).opacity);

test.describe('CompareDeck on the real recordings', () => {
  test('nothing plays by itself', async ({ page }) => {
    const { group, readout } = await openLiveDeck(page);
    await page.waitForTimeout(1500);
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await expect(readout).toHaveText(START);
  });

  test('Play both starts both clips, the readout runs and Pause both stops them', async ({ page }) => {
    const { group, readout } = await openLiveDeck(page);
    await group.getByRole('button', { name: 'Play both' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await expect(group.getByRole('button', { name: 'Pause both' })).toBeVisible();
    await expect(readout).not.toHaveText(START);
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await expect(group.getByRole('button', { name: 'Play both' })).toBeVisible();
  });

  test('one scale, one shared caption and one 140 px colour bar', async ({ page }) => {
    const { live } = await openLiveDeck(page);
    await expect(live.getByText('One colour scale for both wells: −120 to −50 dB re full scale, uncalibrated.')).toBeVisible();
    const bar = live.locator('[data-colourbar][data-orientation="horizontal"]');
    await expect(bar).toHaveCount(1);
    await expect.poll(async () => (await bar.boundingBox())?.width).toBeCloseTo(140, 0);
  });

  test('each row shows its label, definition, assigner, recorder-clock time and matched level', async ({ page }) => {
    const { live } = await openLiveDeck(page);
    const a = row(live, 'A');
    await expect(a).toContainText('ind_H1');
    await expect(a).toContainText('REFERENCE LABEL');
    await expect(a).toContainText('Healthy (H)');
    await expect(a).toContainText('Assigned by MARRS research team');
    await expect(a).toContainText('2022-08-30 12:00 on the recorder clock, timezone unverified');
    await expect(a).toContainText('Level matched: −60.9 dB RMS, gain 0.0 dB');
    const b = row(live, 'B');
    await expect(b).toContainText('ind_D1');
    await expect(b).toContainText('Degraded (D)');
    await expect(b).toContainText('Level matched: −55.8 dB RMS, gain −5.2 dB');
    await expect(live).toContainText(
      'Playback levels are matched to the same RMS level so clips can be compared at similar volume. Original recording levels differ and are not shown by loudness.',
    );
  });

  test('both wells name their dataset, from the contract', async ({ page }) => {
    const { live } = await openLiveDeck(page);
    await expect(row(live, 'A').locator('[data-caption]')).toContainText('ind_H1');
    await expect(row(live, 'B').locator('[data-caption]')).toContainText('ind_D1');
  });

  test('the playhead is at the same place in both wells after a seek', async ({ page }) => {
    const { live, group, readout } = await openLiveDeck(page);
    await group.getByRole('button', { name: 'Next window' }).click();
    await expect(readout).toHaveText('00:05.0 / 00:30.0');
    const transform = (slot: string) => row(live, slot).locator('[data-playhead]').evaluate((el) => (el as HTMLElement).style.transform);
    await expect
      .poll(async () => {
        const [a, b] = [await transform('A'), await transform('B')];
        return a !== '' && a === b;
      })
      .toBe(true);
    await group.getByRole('button', { name: 'Next window' }).click();
    await expect(readout).toHaveText('00:10.0 / 00:30.0');
    await expect
      .poll(async () => {
        const [a, b] = [await transform('A'), await transform('B')];
        return a !== '' && a === b;
      })
      .toBe(true);
  });
});

test.describe('Crossfader', () => {
  test('is named, starts at 50% A, 50% B and moves 5 per arrow and 20 per page', async ({ page }) => {
    const { slider } = await openLiveDeck(page);
    await expect(slider).toHaveAttribute('aria-valuetext', '50% A, 50% B');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '45% A, 55% B');
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuetext', '25% A, 75% B');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(slider).toHaveAttribute('aria-valuetext', '65% A, 35% B');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', '100% A, 0% B');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '0% A, 100% B');
  });

  test('the well the mix moves away from dims to 0.45, and both are 1 at the middle', async ({ page }) => {
    const { live, slider } = await openLiveDeck(page);
    await expect.poll(() => opacityOf(live, 'A')).toBe('1');
    await expect.poll(() => opacityOf(live, 'B')).toBe('1');
    await slider.focus();
    await page.keyboard.press('End');
    await expect.poll(() => opacityOf(live, 'A')).toBe('0.45');
    await expect.poll(() => opacityOf(live, 'B')).toBe('1');
    await page.keyboard.press('Home');
    await expect.poll(() => opacityOf(live, 'B')).toBe('0.45');
    await expect.poll(() => opacityOf(live, 'A')).toBe('1');
  });

  test('one step off the middle dims a little when motion is allowed', async ({ page }) => {
    const { live, slider } = await openLiveDeck(page);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', '55% A, 45% B');
    await expect.poll(async () => Number(await opacityOf(live, 'B'))).toBeGreaterThan(0.9);
    await expect.poll(async () => Number(await opacityOf(live, 'B'))).toBeLessThan(1);
  });

  test('under reduced motion the dim switches at the 50% point with no ramp', async ({ page }) => {
    const { live, slider } = await openLiveDeck(page, '?reduced=1');
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', '55% A, 45% B');
    await expect.poll(() => opacityOf(live, 'B')).toBe('0.45');
    await expect.poll(() => opacityOf(live, 'A')).toBe('1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '45% A, 55% B');
    await expect.poll(() => opacityOf(live, 'A')).toBe('0.45');
    await expect.poll(() => opacityOf(live, 'B')).toBe('1');
  });

  test('"Listen to B" marks B, moves the mix to B alone and announces it; moving the slider clears it', async ({ page }) => {
    const { live, slider } = await openLiveDeck(page);
    const region = live.locator('[data-live-region="listening"]');
    await row(live, 'B').getByRole('button', { name: 'Listen to B' }).click();
    await expect(region).toHaveText('Listening to B');
    await expect(slider).toHaveAttribute('aria-valuetext', '0% A, 100% B');
    await expect(row(live, 'B').locator('[data-listening-bar]')).toBeVisible();
    await expect(row(live, 'A').locator('[data-listening-bar]')).toHaveCount(0);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(region).toHaveText('');
    await expect(row(live, 'B').locator('[data-listening-bar]')).toHaveCount(0);
  });
});

test.describe('CompareDeck states', () => {
  test('different scales: the state replaces the wells and nothing is rescaled', async ({ page }) => {
    await open(page, 'compare');
    const c = cell(page, 'compare', 'different-scales');
    await expect(c).toContainText('These recordings use different analysis settings, so they cannot share one colour scale.');
    await expect(c.locator('[data-spectrogram]')).toHaveCount(0);
    await expect(c.getByRole('slider')).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Play both' })).toHaveCount(0);
  });

  test('disabled row keeps its identity and shows Recording unavailable', async ({ page }) => {
    await open(page, 'compare');
    const c = cell(page, 'compare', 'disabled-row');
    await expect(row(c, 'B')).toContainText('Recording unavailable');
    await expect(row(c, 'B')).toContainText('Degraded (D)');
    await expect(c.getByRole('button', { name: 'Play both' })).toBeDisabled();
  });

  test('loading, empty slot and error row say what the spec says', async ({ page }) => {
    await open(page, 'compare');
    await expect(cell(page, 'compare', 'loading')).toContainText('Loading recording…');
    const empty = cell(page, 'compare', 'empty-slot');
    await expect(empty).toContainText('Add a recording');
    await expect(empty).toContainText('Pick a site or a clip to compare.');
    await expect(empty.getByRole('button', { name: 'Choose a recording' })).toBeVisible();
    const error = cell(page, 'compare', 'error-row');
    await expect(error).toContainText('This recording could not be loaded.');
    await expect(error).toContainText('Retry, or remove it from the comparison.');
    await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(error.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('the selected cell marks B and the playing cell reads Pause both at 12.4 s', async ({ page }) => {
    await open(page, 'compare');
    await expect(row(cell(page, 'compare', 'selected'), 'B').locator('[data-listening-bar]')).toBeVisible();
    const playing = cell(page, 'compare', 'playing');
    await expect(playing.getByRole('button', { name: 'Pause both' })).toBeVisible();
    await expect(playing.getByTestId('transport-readout')).toHaveText('00:12.4 / 00:30.0');
  });

  test('forced hover and focus are drawn through data attributes', async ({ page }) => {
    await open(page, 'compare');
    await expect(cell(page, 'compare', 'hover').locator('[data-identity][data-force-hover]')).toHaveCount(2);
    await expect(cell(page, 'compare', 'focus').getByRole('button', { name: 'Listen to A' })).toHaveAttribute('data-force-focus', '');
  });

  test('the compare row wells are 230, 200 and 160 px high on desktop, tablet and phone', async ({ page }) => {
    await open(page, 'compare');
    const well = row(cell(page, 'compare', 'default'), 'A').locator('[data-well]');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await well.boundingBox())?.height).toBeCloseTo(230, 0);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(async () => (await well.boundingBox())?.height).toBeCloseTo(200, 0);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(async () => (await well.boundingBox())?.height).toBeCloseTo(160, 0);
  });
});

test.describe('ClipCard over the nine excerpts', () => {
  test('each recording has a card with a "Play {site_id}" button, a reference label and "{place} · {date}"', async ({ page }) => {
    await open(page, 'clip-card');
    const grid = cell(page, 'clip-card', 'default');
    await expect(grid.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(9);
    await expect(grid.locator('[data-clip-card]')).toHaveCount(9);
    for (const id of NINE) {
      const card = grid.getByRole('article', { name: id });
      await expect(card.getByRole('button', { name: `Play ${id}` })).toBeVisible();
      await expect(card).toContainText('REFERENCE LABEL');
      await expect(card).toContainText('Assigned by MARRS research team');
      await expect(card.locator('p.text-muted').last()).toContainText(/ · \d{4}-\d{2}-\d{2}$/);
    }
  });

  test('nothing plays by itself; a press plays one card and starting another stops the first', async ({ page }) => {
    await open(page, 'clip-card');
    const grid = cell(page, 'clip-card', 'default');
    await expect(grid.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(9);
    await page.waitForTimeout(1000);
    await expect(grid.locator('[data-clip-card][data-playing="true"]')).toHaveCount(0);
    await grid.getByRole('button', { name: 'Play ind_H1' }).click();
    await expect(grid.getByRole('button', { name: 'Pause ind_H1' })).toBeVisible();
    await grid.getByRole('button', { name: 'Play ind_D1' }).click();
    await expect(grid.getByRole('button', { name: 'Pause ind_D1' })).toBeVisible();
    await expect(grid.getByRole('button', { name: 'Play ind_H1' })).toBeVisible();
    await expect(grid.locator('[data-clip-card][data-playing="true"]')).toHaveCount(1);
    await grid.getByRole('button', { name: 'Pause ind_D1' }).click();
    await expect(grid.locator('[data-clip-card][data-playing="true"]')).toHaveCount(0);
  });

  test('the play button is 56 px', async ({ page }) => {
    await open(page, 'clip-card');
    const button = cell(page, 'clip-card', 'hover').getByRole('button', { name: 'Play ind_H1' });
    await expect.poll(async () => (await button.boundingBox())?.width).toBeCloseTo(56, 0);
    await expect.poll(async () => (await button.boundingBox())?.height).toBeCloseTo(56, 0);
  });

  test('the thumb spectrogram is 150 px high', async ({ page }) => {
    await open(page, 'clip-card');
    const well = cell(page, 'clip-card', 'hover').locator('[data-spectrogram] [data-well]');
    await expect.poll(async () => (await well.boundingBox())?.height).toBeCloseTo(150, 0);
  });

  test('loading and error cells say what the spec says; forced states are drawn through data attributes', async ({ page }) => {
    await open(page, 'clip-card');
    await expect(cell(page, 'clip-card', 'loading')).toContainText('Loading recording…');
    await expect(cell(page, 'clip-card', 'error')).toContainText('This recording could not be loaded.');
    await expect(cell(page, 'clip-card', 'hover').locator('[data-clip-card-text][data-force-hover]')).toHaveCount(1);
    await expect(cell(page, 'clip-card', 'focus').getByRole('button', { name: 'Play ind_H1' })).toHaveAttribute('data-force-focus', '');
    await expect(cell(page, 'clip-card', 'playing').getByRole('button', { name: 'Pause ind_H1' })).toBeVisible();
  });
});

for (const direction of DIRECTIONS) {
  for (const slug of ['compare', 'clip-card']) {
    test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
      await open(page, slug, `?direction=${direction}`);
      await expect(page.locator(`section#${slug} [data-spectrogram][data-ready="false"]`)).toHaveCount(0);
      await expect(page.locator(`section#${slug} [data-spectrogram][data-ready="true"]`).first()).toBeVisible();
      const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
      const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
