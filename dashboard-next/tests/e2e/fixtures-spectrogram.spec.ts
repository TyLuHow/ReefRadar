import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * Spectrogram well, ColourBar, Waveform and the scale section on /dev/fixtures (04-13, DS-03).
 * The wells draw the real committed ind_H1 excerpt (public/audio/marrs), so these specs prove a
 * non-blank render of real data at devicePixelRatio 2. Canvases and React Aria settle on the next
 * frame: every spec waits for data-ready before it reads a pixel, and each measurement is taken
 * in one in-page call so no expected value is computed outside a poll.
 */

const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'audio-manifest.json'), 'utf8')) as {
  excerpts: Array<{ excerpt_id: string; duration_s: number; rms_dbfs: number }>;
};
const EXCERPT = MANIFEST.excerpts.find((excerpt) => excerpt.excerpt_id === 'ind_H1_20220830_120000') as { duration_s: number; rms_dbfs: number };
const MINUS = '−';
const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
const BAD_IMPACTS = new Set(['serious', 'critical']);

test.use({ deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const cell = (page: Page, state: string, slug = 'spectrogram') => page.locator(`section#${slug} [data-fixture-state="${state}"]`);

/** Opens the single-section page and waits for the chrome and for the panel well to have drawn. */
async function openSpectrogram(page: Page, query = '') {
  await page.goto(`/dev/fixtures/spectrogram/${query}`, { waitUntil: 'load' });
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  await expect(page.locator('[data-fixture-state="panel"] [data-ready="true"]')).toBeVisible();
}

/** Distinct colours on a canvas and its size against its CSS box, measured in one in-page call. */
async function inspectCanvas(canvas: Locator) {
  return canvas.evaluate((node) => {
    const el = node as HTMLCanvasElement;
    const ctx = el.getContext('2d');
    if (!ctx) throw new Error('canvas has no 2d context');
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) seen.add(((data[i + 3] << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0);
    const rect = el.getBoundingClientRect();
    return { distinct: seen.size, width: el.width, height: el.height, cssWidth: rect.width, cssHeight: rect.height, dpr: window.devicePixelRatio };
  });
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('element has no box');
  return found;
}

test.describe('Spectrogram well on real data', () => {
  test('the panel well draws the real clip: non-blank, and the backing store follows devicePixelRatio', async ({ page }) => {
    await openSpectrogram(page);
    const info = await inspectCanvas(cell(page, 'panel').locator('canvas'));
    expect(info.dpr).toBe(2);
    expect(info.distinct).toBeGreaterThanOrEqual(50);
    expect(Math.abs(info.width - info.cssWidth * info.dpr)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.height - info.cssHeight * info.dpr)).toBeLessThanOrEqual(1);
  });

  test('every variant paints the same real data, non-blank', async ({ page }) => {
    await openSpectrogram(page);
    for (const state of ['hero', 'compare', 'thumb', 'hover', 'selected-window', 'scroll-mode', 'bands']) {
      await expect(cell(page, state).locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
      const info = await inspectCanvas(cell(page, state).locator('canvas'));
      expect(info.distinct, state).toBeGreaterThanOrEqual(50);
      expect(Math.abs(info.width - info.cssWidth * info.dpr), state).toBeLessThanOrEqual(1);
    }
  });

  test('the waveform draws the same recording in well ink', async ({ page }) => {
    await openSpectrogram(page);
    const waveform = cell(page, 'waveform').locator('[data-waveform]');
    await expect(waveform).toHaveAttribute('data-ready', 'true');
    await expect(waveform).toHaveAttribute('aria-label', 'Waveform, 30 seconds at 16 kHz');
    const info = await inspectCanvas(waveform.locator('canvas'));
    expect(info.distinct).toBeGreaterThanOrEqual(2);
    expect(Math.abs(info.width - info.cssWidth * info.dpr)).toBeLessThanOrEqual(1);
  });

  test('the panel is an image named for the site, range and duration, described by a caption that states the fixed range and that it is uncalibrated', async ({ page }) => {
    await openSpectrogram(page);
    const well = cell(page, 'panel').getByRole('img', { name: 'Spectrogram of ind_H1, 0 to 8 kHz, 30 seconds' });
    await expect(well).toBeVisible();
    await expect(well).toHaveAccessibleDescription(
      new RegExp(`^ind_H1, MARRS, recorded 2022-08-30 12:00 on the recorder clock \\(timezone unverified\\)\\. 30 s, 0 to 8 kHz, 1024-point windows, level in dB re full scale, uncalibrated, shared range ${MINUS}120 to ${MINUS}50 dB\\.`),
    );
    // The metadata-only summary carries the manifest RMS level, with a real minus sign.
    const summary = await well.locator('p.sr-only').textContent();
    expect(summary).toBe(`${EXCERPT.duration_s} s excerpt at 16 kHz, RMS level ${MINUS}${Math.abs(EXCERPT.rms_dbfs)} dBFS (from the audio manifest).`);
  });

  test('the hero caption adds the brighter-is-louder note and the thumb caption is read but not drawn', async ({ page }) => {
    await openSpectrogram(page);
    await expect(cell(page, 'hero').locator('[data-caption]')).toContainText('Brighter is louder. Levels are relative, not calibrated sound pressure.');
    await expect(cell(page, 'panel').locator('[data-caption]')).not.toContainText('Brighter is louder');
    const thumbCaption = cell(page, 'thumb').locator('[data-caption]');
    await expect(thumbCaption).toContainText('uncalibrated');
    // sr-only keeps the text in the accessibility tree in a 1 px box, so the check is the utility class.
    await expect(thumbCaption).toHaveClass(/sr-only/);
  });

  test('panel axes: 0 to 8 kHz every 2 kHz, time every 5 s, and the colourbar levels', async ({ page }) => {
    await openSpectrogram(page);
    const panel = cell(page, 'panel');
    await expect(panel.locator('[data-axis="frequency"] [data-tick]')).toHaveText(['0', '2', '4', '6', '8 kHz']);
    await expect(panel.locator('[data-axis="time"] [data-tick]')).toHaveText(['0:00', '0:05', '0:10', '0:15', '0:20', '0:25', '0:30']);
    await expect(panel.locator('[data-colourbar][data-orientation="vertical"] [data-tick]')).toHaveText([`${MINUS}120`, `${MINUS}100`, `${MINUS}80`, `${MINUS}60`, `${MINUS}50`]);
  });

  test('hero and compare carry the 8 kHz chips, hero a time strip and an end-labelled horizontal colourbar', async ({ page }) => {
    await openSpectrogram(page);
    await expect(cell(page, 'hero').locator('[data-chip]')).toHaveText(['8 kHz', '4 kHz', '0']);
    await expect(cell(page, 'hero').locator('[data-axis="time"] [data-tick]').first()).toHaveText('0:00');
    await expect(cell(page, 'hero').locator('[data-colourbar] [data-tick]')).toHaveText([`${MINUS}120`, `${MINUS}50`]);
    await expect(cell(page, 'compare').locator('[data-chip]')).toHaveText(['8 kHz', '0']);
    await expect(cell(page, 'thumb').locator('[data-axis], [data-chip], [data-colourbar]')).toHaveCount(0);
  });

  test('the pointer readout is forced in the hover cell and follows a real pointer in the panel', async ({ page }) => {
    await openSpectrogram(page);
    await expect(cell(page, 'hover').locator('[data-readout]')).toHaveText(new RegExp(`^12\\.4 s \\u00b7 3\\.2 kHz \\u00b7 ${MINUS}\\d+ dB$`));
    await expect(cell(page, 'hover')).toContainText('State forced for review');

    const plot = cell(page, 'panel').locator('[data-plot]');
    await plot.scrollIntoViewIfNeeded();
    const bounds = await box(plot);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(cell(page, 'panel').locator('[data-readout]')).toHaveText(new RegExp(`^15\\.\\d s \\u00b7 [34]\\.\\d kHz \\u00b7 ${MINUS}\\d+ dB$`));
    await page.mouse.move(2, 2);
    await expect(cell(page, 'panel').locator('[data-readout]')).toHaveCount(0);
  });

  test('the playhead sits at its elapsed fraction and the selected window spans 10 s to 15 s', async ({ page }) => {
    await openSpectrogram(page);
    const selected = cell(page, 'selected-window');
    await expect(selected.locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
    // One in-page call reads every box, so the three numbers are from the same layout.
    const layout = await selected.evaluate((root) => {
      const rect = (selector: string) => (root.querySelector(selector) as HTMLElement).getBoundingClientRect();
      const plot = rect('[data-plot]');
      const playhead = rect('[data-playhead]');
      const window = rect('[data-selected-window]');
      return {
        playhead: (playhead.left + playhead.width / 2 - plot.left) / plot.width,
        windowLeft: (window.left - plot.left) / plot.width,
        windowWidth: window.width / plot.width,
      };
    });
    expect(layout.playhead).toBeCloseTo(12.4 / 30, 2);
    expect(layout.windowLeft).toBeCloseTo(10 / 30, 2);
    expect(layout.windowWidth).toBeCloseTo(5 / 30, 2);
  });

  test('scroll mode holds the playhead at 22 % of the width', async ({ page }) => {
    await openSpectrogram(page);
    const scroll = cell(page, 'scroll-mode');
    await expect(scroll.locator('[data-spectrogram][data-ready="true"]')).toHaveAttribute('data-play-mode', 'scroll');
    const fraction = await scroll.evaluate((root) => {
      const plot = (root.querySelector('[data-plot]') as HTMLElement).getBoundingClientRect();
      const playhead = (root.querySelector('[data-playhead]') as HTMLElement).getBoundingClientRect();
      return (playhead.left + playhead.width / 2 - plot.left) / plot.width;
    });
    expect(fraction).toBeCloseTo(0.22, 2);
  });

  test('under reduced motion the scroll cell is a sweep: the playhead is at its elapsed fraction', async ({ page }) => {
    await openSpectrogram(page, '?reduced=1');
    const scroll = cell(page, 'scroll-mode');
    await expect(scroll.locator('[data-spectrogram][data-ready="true"]')).toHaveAttribute('data-play-mode', 'sweep');
    const fraction = await scroll.evaluate((root) => {
      const plot = (root.querySelector('[data-plot]') as HTMLElement).getBoundingClientRect();
      const playhead = (root.querySelector('[data-playhead]') as HTMLElement).getBoundingClientRect();
      return (playhead.left + playhead.width / 2 - plot.left) / plot.width;
    });
    expect(fraction).toBeCloseTo(12.4 / 30, 2);
  });

  test('the bands cell draws three labelled fixture bands and says they are placeholders', async ({ page }) => {
    await openSpectrogram(page);
    const bands = cell(page, 'bands');
    await expect(bands.locator('[data-band-label]')).toHaveText(['Fixture band 1', 'Fixture band 2', 'Fixture band 3']);
    await expect(bands.locator('[data-band-edge]')).toHaveCount(2);
    await expect(bands).toContainText("Fixture bands split 0 to the recording's top frequency into three equal ranges. The cited band table arrives in a later phase.");
  });

  test('the audio is attributed on the page that shows it', async ({ page }) => {
    await openSpectrogram(page);
    await expect(page.locator('section#spectrogram')).toContainText('CC BY 4.0');
    await expect(page.locator('section#spectrogram')).toContainText('10.5522/04/29958062');
  });

  test('the wells are not tab stops and hold no focusable control', async ({ page }) => {
    await openSpectrogram(page);
    await expect(cell(page, 'panel').locator('[data-spectrogram] button, [data-spectrogram] a, [data-spectrogram] [tabindex]')).toHaveCount(0);
  });
});

test.describe('Spectrogram well sizes and states', () => {
  const VIEWPORTS = [
    { name: 'desktop', width: 1280, height: 900, panel: 220, hero: 440, compare: 230 },
    { name: 'tablet', width: 800, height: 900, panel: 220, hero: 360, compare: 200 },
    { name: 'phone', width: 390, height: 900, panel: 160, hero: 240, compare: 160 },
  ] as const;

  for (const viewport of VIEWPORTS) {
    test(`well heights at ${viewport.name} (${viewport.width} px) follow the UI-SPEC, and thumb stays 150`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openSpectrogram(page);
      for (const [state, height] of [['panel', viewport.panel], ['hero', viewport.hero], ['compare', viewport.compare], ['thumb', 150]] as const) {
        await expect.poll(async () => (await box(cell(page, state).locator('[data-well]'))).height, { message: `${state} well height` }).toBe(height);
      }
    });
  }

  test('the colourbar is vertical at the right of a panel from 640 px and horizontal under it on a phone', async ({ page }) => {
    await openSpectrogram(page);
    const panel = cell(page, 'panel');
    await expect(panel.locator('[data-colourbar][data-orientation="vertical"]')).toBeVisible();
    await expect(panel.locator('[data-colourbar][data-orientation="horizontal"]')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 900 });
    await expect(panel.locator('[data-colourbar][data-orientation="vertical"]')).toBeHidden();
    await expect(panel.locator('[data-colourbar][data-orientation="horizontal"]')).toBeVisible();
  });

  const STATES: Array<[string, string[]]> = [
    ['loading', ['Drawing spectrogram…']],
    ['empty', ['No recording selected', 'Choose a site or a clip to see its spectrogram.']],
    ['error', ['The spectrogram could not be drawn.', 'The audio and any readings are unaffected. Reload the page to try again.']],
    ['unsupported', ['This browser cannot draw the spectrogram.']],
  ];

  for (const [state, lines] of STATES) {
    test(`the ${state} state keeps the panel well height and says what happened`, async ({ page }) => {
      await openSpectrogram(page);
      const block = cell(page, state).locator(`[data-spectrogram-state="${state}"]`);
      for (const line of lines) await expect(block).toContainText(line);
      // Both heights are read in the same poll, so neither is a value captured before the layout settled.
      await expect
        .poll(async () => {
          const [state_, well] = [(await box(block)).height, (await box(cell(page, 'panel').locator('[data-well]'))).height];
          return state_ === well && well > 0;
        })
        .toBe(true);
      await expect(block.locator('canvas')).toHaveCount(0);
    });
  }

  for (const direction of DIRECTIONS) {
    test(`wells stay dark in ${direction}`, async ({ page }) => {
      await openSpectrogram(page, `?direction=${direction}`);
      for (const state of ['panel', 'hero', 'compare']) {
        const channels = await cell(page, state).locator('[data-well]').evaluate((el) => {
          const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor);
          return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [255, 255, 255];
        });
        for (const channel of channels) expect(channel, `${state} in ${direction}`).toBeLessThan(40);
      }
    });
  }
});

test.describe('Spectrogram scale section', () => {
  test('prints the scale, range, window, hop and axis from the constants, and both colourbars', async ({ page }) => {
    await page.goto('/dev/fixtures/spectrogram-scale/', { waitUntil: 'load' });
    await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
    const parameters = cell(page, 'parameters', 'spectrogram-scale');
    await expect(parameters).toContainText('magma, 256-step lookup table (matplotlib, CC0; Nathaniel J. Smith and Stefan van der Walt)');
    await expect(parameters).toContainText(`${MINUS}120 to ${MINUS}50 dB re full scale of the file, uncalibrated, shared by every well`);
    await expect(parameters).toContainText('1024-point Hann');
    await expect(parameters).toContainText('256 samples');
    await expect(parameters).toContainText('linear, 0 to Nyquist');
    await expect(cell(page, 'vertical', 'spectrogram-scale').locator('[data-colourbar] [data-tick]')).toHaveText([`${MINUS}120`, `${MINUS}100`, `${MINUS}80`, `${MINUS}60`, `${MINUS}50`]);
    await expect(cell(page, 'horizontal', 'spectrogram-scale')).toContainText('Level, dB re full scale (uncalibrated; hydrophone sensitivity not applied).');
  });
});

for (const direction of DIRECTIONS) {
  for (const slug of ['spectrogram-scale', 'spectrogram']) {
    test(`axe: ${slug} has no serious or critical violation in ${direction}`, async ({ page }) => {
      await page.goto(`/dev/fixtures/${slug}/?direction=${direction}`, { waitUntil: 'load' });
      await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
      if (slug === 'spectrogram') {
        for (const state of ['panel', 'hero', 'compare', 'thumb']) {
          await expect(cell(page, state).locator('[data-spectrogram][data-ready="true"]')).toBeVisible();
        }
        await expect(cell(page, 'waveform').locator('[data-waveform][data-ready="true"]')).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
      const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
      expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
}
