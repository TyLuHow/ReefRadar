import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * Transport, WindowStrip and BandToggle on /dev/fixtures (04-15, DS-05, DS-06).
 *
 * The live cells play and draw the real committed ind_H1 excerpt (30 s, 16 kHz). Canvases and React
 * Aria settle on the next frame, so every spec waits for the well's data-ready and for the Transport's
 * status before it presses anything, scopes every locator to one state cell (the fixtures page holds
 * many Transports), and never computes an expected value outside a poll. What this cannot prove is the
 * sound itself: headless Chromium has no listener, so the specs assert the transport state and the
 * readout moving, which come from the AudioContext clock, not audible output.
 */

const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
const BAD_IMPACTS = new Set(['serious', 'critical']);
const START = '00:00.0 / 00:30.0';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const cell = (page: Page, slug: string, state: string) => page.locator(`section#${slug} [data-fixture-state="${state}"]`);

async function open(page: Page, slug: string, query = '') {
  await page.goto(`/dev/fixtures/${slug}/${query}`, { waitUntil: 'load' });
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
}

/** The live Transport cell, once the real clip has loaded and the controls are ready. */
async function openLiveTransport(page: Page, query = '') {
  await open(page, 'transport', query);
  const live = cell(page, 'transport', 'live');
  await expect(live.locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
  const group = live.getByRole('group', { name: 'Playback', exact: true });
  await expect(group).toHaveAttribute('data-transport-status', 'idle');
  return { live, group, readout: group.getByTestId('transport-readout') };
}

test.describe('Transport on the real clip', () => {
  test('nothing plays by itself', async ({ page }) => {
    const { group, readout } = await openLiveTransport(page);
    await page.waitForTimeout(1500);
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await expect(readout).toHaveText(START);
  });

  test('a click starts playback, the readout runs and Space on the focused button pauses it', async ({ page }) => {
    const { group, readout } = await openLiveTransport(page);
    await group.getByRole('button', { name: 'Play' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await expect(group.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(readout).not.toHaveText(START);
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await expect(group.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('Space plays from the scrub slider, which proves the group-level handler', async ({ page }) => {
    const { group } = await openLiveTransport(page);
    await group.getByRole('slider', { name: 'Playback position' }).focus();
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
  });

  test('the arrow keys move one 5 s window and Home and End jump to the ends', async ({ page }) => {
    const { group, readout } = await openLiveTransport(page);
    await group.getByRole('button', { name: 'Play' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(readout).toHaveText('00:05.0 / 00:30.0');
    await page.keyboard.press('ArrowRight');
    await expect(readout).toHaveText('00:10.0 / 00:30.0');
    await page.keyboard.press('ArrowLeft');
    await expect(readout).toHaveText('00:05.0 / 00:30.0');
    await page.keyboard.press('End');
    await expect(readout).toHaveText('00:30.0 / 00:30.0');
    await expect(group).toHaveAttribute('data-transport-status', 'ended');
    await expect(group.getByRole('button', { name: 'Replay' })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(readout).toHaveText(START);
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
  });

  test('the scrub slider is named, carries the words for its value and seeks', async ({ page }) => {
    const { group, readout } = await openLiveTransport(page);
    const slider = group.getByRole('slider', { name: 'Playback position' });
    await expect(slider).toHaveAttribute('aria-valuetext', '0:00 of 0:30');
    await group.getByRole('button', { name: 'Next window' }).click();
    await expect(readout).toHaveText('00:05.0 / 00:30.0');
    await expect(slider).toHaveAttribute('aria-valuetext', '0:05 of 0:30');
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '0:30 of 0:30');
  });

  test('under reduced motion playback still starts and the readout still runs', async ({ page }) => {
    const { group, readout } = await openLiveTransport(page, '?reduced=1');
    await group.getByRole('button', { name: 'Play' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await expect(readout).not.toHaveText(START);
  });

  test('the play button is 44, 56, 64 and 96 px in the compact, medium, compare and large sizes', async ({ page }) => {
    await open(page, 'transport');
    const widths: Array<[string, number]> = [
      ['default', 44],
      ['medium', 56],
      ['medium-compare', 64],
      ['large', 96],
    ];
    for (const [state, width] of widths) {
      const button = cell(page, 'transport', state).getByRole('button', { name: 'Play' });
      await expect.poll(async () => (await button.boundingBox())?.width, state).toBeCloseTo(width, 0);
      await expect.poll(async () => (await button.boundingBox())?.height, state).toBeCloseTo(width, 0);
    }
  });

  const COPY: Array<[string, string[]]> = [
    ['disabled', ['Select a recording to listen.', '--:-- / --:--']],
    ['loading', ['Loading audio…']],
    ['empty', ['No recording selected.', 'Choose a site or a clip to listen.', '--:-- / --:--']],
    ['error', ['Audio could not be loaded.', 'Check your connection, then try again.']],
    ['unsupported', ['This browser cannot play audio.', 'The spectrogram and readings still work.']],
  ];
  for (const [state, lines] of COPY) {
    test(`the ${state} cell says what the spec says`, async ({ page }) => {
      await open(page, 'transport');
      for (const line of lines) await expect(cell(page, 'transport', state)).toContainText(line);
    });
  }

  test('unsupported hides the buttons and error offers Retry', async ({ page }) => {
    await open(page, 'transport');
    await expect(cell(page, 'transport', 'unsupported').getByRole('button')).toHaveCount(0);
    await expect(cell(page, 'transport', 'error').getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(cell(page, 'transport', 'disabled').getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  test('the forced hover, pressed and focus cells carry the forced attribute on the play button', async ({ page }) => {
    await open(page, 'transport');
    await expect(cell(page, 'transport', 'hover').getByRole('button', { name: 'Play' })).toHaveAttribute('data-force-hover', '');
    await expect(cell(page, 'transport', 'pressed').getByRole('button', { name: 'Play' })).toHaveAttribute('data-force-pressed', '');
    await expect(cell(page, 'transport', 'focus').getByRole('button', { name: 'Play' })).toHaveAttribute('data-force-focus', '');
  });
});

/** The strip's cells in one state cell. */
const options = (c: Locator) => c.getByRole('option');

test.describe('WindowStrip on the real clip', () => {
  test('no cell shows a model reading, only unclassified and measured-energy cells', async ({ page }) => {
    await open(page, 'window-strip');
    await expect(page.locator('section#window-strip [data-cell-kind="energy"]').first()).toBeVisible();
    await expect(page.locator('section#window-strip [data-cell-kind="reading"]')).toHaveCount(0);
    await expect(page.locator('section#window-strip [data-cell-kind="abstain"]')).toHaveCount(0);
    await expect(options(cell(page, 'window-strip', 'default'))).toHaveCount(6);
    await expect(cell(page, 'window-strip', 'default').locator('[data-cell-kind="empty"]')).toHaveCount(6);
    await expect(cell(page, 'window-strip', 'energy').locator('[data-cell-kind="energy"]')).toHaveCount(6);
    await expect(cell(page, 'window-strip', 'energy')).toContainText(
      'Shade is the measured RMS level of each 5 s window, from the recording itself. Shading is relative within this clip',
    );
    await expect(cell(page, 'window-strip', 'energy')).toContainText('No model readings exist for these windows yet.');
    await expect(cell(page, 'window-strip', 'default')).toContainText('No model readings exist for these windows yet.');
    await expect(page.locator('section#window-strip')).not.toContainText("Colour is the model's reading");
  });

  test('the energy cells carry their level and window times in their names', async ({ page }) => {
    await open(page, 'window-strip');
    const energy = cell(page, 'window-strip', 'energy');
    await expect(energy.getByRole('option', { name: /^Window 1, 0:00 to 0:05, no reading, −?\d+(\.\d+)? dB RMS$/ })).toBeVisible();
    await expect(energy.getByRole('option', { name: /^Window 6, 0:25 to 0:30, no reading, −?\d+(\.\d+)? dB RMS$/ })).toBeVisible();
  });

  test('the strip lines up with the plot above it, cell k under seconds 5k to 5k + 5', async ({ page }) => {
    await open(page, 'window-strip');
    const energy = cell(page, 'window-strip', 'energy');
    await expect(energy.locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
    const plot = energy.locator('[data-plot]');
    const cells = options(energy);
    await expect
      .poll(async () => {
        const plotBox = await plot.boundingBox();
        const first = await cells.first().boundingBox();
        const last = await cells.last().boundingBox();
        if (!plotBox || !first || !last) return null;
        return [Math.abs(first.x - plotBox.x) <= 2, Math.abs(last.x + last.width - (plotBox.x + plotBox.width)) <= 2];
      })
      .toEqual([true, true]);
  });

  test('the live strip is one tab stop, and choosing a window moves the Transport to its start', async ({ page }) => {
    await open(page, 'window-strip');
    const live = cell(page, 'window-strip', 'live');
    await expect(live.locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
    const group = live.getByRole('group', { name: 'Playback', exact: true });
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    const readout = group.getByTestId('transport-readout');
    await options(live).nth(2).click();
    await expect(readout).toHaveText('00:10.0 / 00:30.0');
    await expect(options(live).nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(options(live).nth(3)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(readout).toHaveText('00:15.0 / 00:30.0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(readout).toHaveText('00:20.0 / 00:30.0');
    // Choosing the window that is already selected returns the Transport to its start.
    await group.getByRole('button', { name: 'Next window' }).click();
    await expect(readout).toHaveText('00:25.0 / 00:30.0');
    await options(live).nth(4).focus();
    await page.keyboard.press('Enter');
    await expect(readout).toHaveText('00:20.0 / 00:30.0');
  });

  test('Home and End jump to the first and last cell', async ({ page }) => {
    await open(page, 'window-strip');
    const strip = options(cell(page, 'window-strip', 'default'));
    await strip.nth(0).focus();
    await page.keyboard.press('End');
    await expect(strip.nth(5)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(strip.nth(0)).toBeFocused();
  });

  test('dense mode: no glyphs, 44 px high, the names and tooltips stay', async ({ page }) => {
    await open(page, 'window-strip');
    const dense = cell(page, 'window-strip', 'dense');
    const list = dense.getByRole('listbox');
    await expect(list).toHaveAttribute('data-dense', 'true');
    const cells = options(dense);
    await expect(cells).toHaveCount(6);
    await expect(dense.locator('[role="option"] svg')).toHaveCount(0);
    for (let i = 0; i < 6; i++) {
      await expect.poll(async () => (await cells.nth(i).boundingBox())?.height, `cell ${i}`).toBeCloseTo(44, 0);
      await expect.poll(async () => ((await cells.nth(i).boundingBox())?.width ?? 99) < 16, `cell ${i}`).toBe(true);
    }
    await cells.nth(1).hover();
    await expect(dense.getByRole('tooltip')).toContainText(/^Window 2 · 0:05 to 0:10 · No reading · −?\d/);
  });

  test('the wide strips are not dense', async ({ page }) => {
    await open(page, 'window-strip');
    await expect(cell(page, 'window-strip', 'energy').getByRole('listbox')).toHaveAttribute('data-dense', 'false');
  });

  test('the disabled cell is non-interactive and says why', async ({ page }) => {
    await open(page, 'window-strip');
    const disabled = cell(page, 'window-strip', 'disabled');
    await expect(disabled.getByRole('listbox')).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled).toContainText('Readings are not available for this recording.');
  });

  const COPY: Array<[string, string[]]> = [
    ['loading', ['Loading windows…']],
    ['empty', ['No windows yet.', 'Windows appear after the recording has been analysed.']],
    ['error', ['Window readings could not be loaded.', 'The recording and its spectrogram are unaffected.']],
  ];
  for (const [state, lines] of COPY) {
    test(`the ${state} cell says what the spec says`, async ({ page }) => {
      await open(page, 'window-strip');
      for (const line of lines) await expect(cell(page, 'window-strip', state)).toContainText(line);
    });
  }
});

test.describe('BandToggle on the real recording range', () => {
  test('Low and Mid are on, High is off, and the ranges split 0 to 8 kHz in three', async ({ page }) => {
    await open(page, 'band-toggle');
    const group = cell(page, 'band-toggle', 'default').getByRole('toolbar', { name: 'Frequency bands to play' });
    await expect(group.getByRole('button', { name: /^Low/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: /^Mid/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: /^High/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(group).toContainText('0 to 2.7 kHz');
    await expect(group).toContainText('2.7 to 5.3 kHz');
    await expect(group).toContainText('5.3 to 8 kHz');
    await expect(page.locator('section#band-toggle')).toContainText(
      "Fixture bands split 0 to the recording's top frequency into three equal ranges. The cited band table arrives in a later phase.",
    );
  });

  test('at least one band always stays on', async ({ page }) => {
    await open(page, 'band-toggle');
    const group = cell(page, 'band-toggle', 'default').getByRole('toolbar', { name: 'Frequency bands to play' });
    const low = group.getByRole('button', { name: /^Low/ });
    const mid = group.getByRole('button', { name: /^Mid/ });
    await low.click();
    await expect(low).toHaveAttribute('aria-pressed', 'false');
    await mid.click();
    await expect(mid).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, 'band-toggle', 'default')).toContainText('Playing the selected bands. At least one band stays on.');
  });

  test('the forced disabled band is disabled, explains itself in text and shows a tooltip on hover', async ({ page }) => {
    await open(page, 'band-toggle');
    const disabled = cell(page, 'band-toggle', 'disabled');
    const high = disabled.getByRole('button', { name: /^High/ });
    await expect(high).toBeDisabled();
    await expect(high).toContainText("Disabled for review: no fixture band lies above this recording's 8 kHz limit.");
    await high.locator('..').hover();
    await expect(disabled.getByRole('tooltip')).toContainText('Disabled for review');
  });

  const COPY: Array<[string, string[]]> = [
    ['loading', ['Loading bands…']],
    ['empty', ['No bands are defined for this recording.']],
    ['error', ['Band filter is unavailable.', 'Playback continues without filtering.']],
  ];
  for (const [state, lines] of COPY) {
    test(`the ${state} cell says what the spec says`, async ({ page }) => {
      await open(page, 'band-toggle');
      for (const line of lines) await expect(cell(page, 'band-toggle', state)).toContainText(line);
    });
  }
});

for (const direction of DIRECTIONS) {
  for (const slug of ['transport', 'window-strip', 'band-toggle']) {
    test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
      await open(page, slug, `?direction=${direction}`);
      if (slug !== 'band-toggle') {
        await expect(cell(page, slug, 'live').locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
      const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
