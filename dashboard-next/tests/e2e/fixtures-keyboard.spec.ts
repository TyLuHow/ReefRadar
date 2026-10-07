import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { focusIsInside, liveCell, openSection, settleFrames, startTabbing, stateCell, tabTo } from './support/fixtures';

/**
 * The keyboard contract of every DS-04 primitive, and of Transport, WindowStrip and the crossfader,
 * in a real browser (04-22, DS-04, DS-06). One test per primitive, each on its own section page.
 *
 * What is proven here is the contract in the UI-SPEC (focus order, keys, names, values), reached
 * through real key presses. Wait for state, never for time: React Aria, the clock and the canvases
 * settle on the next frame, so every assertion is a web-first assertion or sits inside a poll, and
 * every locator is scoped to one section or state cell (the pages hold many controls of one kind).
 * Headless Chromium has no listener, so Transport is asserted by its status and readout.
 */

// tests/e2e -> tests -> dashboard-next -> repo root: the sites the mocked contract serves.
const CONTRACT_SITES = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: { site_id: string }[];
  }
).sites;

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/** True while any ancestor-or-self of <main> is hidden from assistive technology or inert. */
async function backgroundIsHidden(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return main !== null && main.closest('[aria-hidden="true"], [inert]') !== null;
  });
}

test.describe('Dialog and AlertDialog', () => {
  test('Dialog: Enter opens, focus is trapped, the background is hidden, Escape closes and focus returns', async ({ page }) => {
    await openSection(page, 'dialog');
    const trigger = page.getByRole('button', { name: 'Open dialog' });
    await startTabbing(page);
    await tabTo(page, trigger);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'About this dialog' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);
    await expect.poll(() => backgroundIsHidden(page)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(dialog)).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInside(dialog)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(() => backgroundIsHidden(page)).toBe(false);
  });

  test('AlertDialog: focus starts on "Keep comparison" and Escape cancels', async ({ page }) => {
    await openSection(page, 'dialog');
    const trigger = page.getByRole('button', { name: 'Open alert dialog' });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog', { name: 'Discard this comparison?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep comparison' })).toBeFocused();
    await expect.poll(() => backgroundIsHidden(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe('Sheet', () => {
  for (const side of ['right', 'bottom'] as const) {
    test(`Sheet ${side}: the dialog contract holds (trap, hidden background, Escape, focus return)`, async ({ page }) => {
      await openSection(page, 'sheet');
      const trigger = page.getByRole('button', { name: `Open ${side} sheet` });
      await startTabbing(page);
      await tabTo(page, trigger);
      await page.keyboard.press('Enter');
      const sheet = page.getByRole('dialog', { name: side === 'right' ? 'Right sheet' : 'Bottom sheet' });
      await expect(sheet).toBeVisible();
      await expect.poll(() => focusIsInside(sheet)).toBe(true);
      await expect.poll(() => backgroundIsHidden(page)).toBe(true);
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab');
        expect(await focusIsInside(sheet)).toBe(true);
      }
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInside(sheet)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe('Listbox', () => {
  test('single: ArrowDown moves, typing a site id jumps to it and Enter selects', async ({ page }) => {
    await openSection(page, 'listbox');
    const list = page.getByRole('listbox', { name: 'Reference sites, all' });
    await list.scrollIntoViewIfNeeded();
    await list.focus();
    const options = list.getByRole('option');
    await expect(options.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toBeFocused();
    // The id of the last site in the published contract (the mocked contract serves the same file).
    const lastId = CONTRACT_SITES[CONTRACT_SITES.length - 1]?.site_id ?? '';
    expect(lastId).not.toBe('');
    await page.keyboard.press('Home');
    await expect(options.first()).toBeFocused();
    await page.keyboard.type(lastId);
    const target = list.getByRole('option', { name: new RegExp(`^${lastId}\\b`) });
    await expect(target).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(target).toHaveAttribute('aria-selected', 'true');
  });

  test('multiple: Space toggles the focused option', async ({ page }) => {
    await openSection(page, 'listbox');
    const list = page.getByRole('listbox', { name: 'Reference sites, multiple' });
    await list.scrollIntoViewIfNeeded();
    await list.focus();
    const first = list.getByRole('option').first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Table and DataTable', () => {
  test('Table: one tab stop, ArrowDown moves rows, Enter sorts a header and Space selects a row', async ({ page }) => {
    await openSection(page, 'table');
    const grid = (await liveCell(page, 'table')).getByRole('grid');
    await grid.scrollIntoViewIfNeeded();
    const rows = grid.getByRole('row');
    const country = grid.getByRole('columnheader', { name: 'Country' });
    await country.focus();
    await page.keyboard.press('Enter');
    await expect(country).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Space');
    await expect(country).toHaveAttribute('aria-sort', 'descending');
    await rows.nth(1).focus();
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
    // One tab stop: Tab leaves the grid, and Shift+Tab comes back into it once.
    await page.keyboard.press('Tab');
    await expect.poll(() => focusIsInside(grid)).toBe(false);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusIsInside(grid)).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusIsInside(grid)).toBe(false);
  });

  test('DataTable: ArrowDown moves rows, Enter on the Site header toggles aria-sort, Enter runs the row action and Space selects', async ({
    page,
  }) => {
    await openSection(page, 'data-table');
    const live = await liveCell(page, 'data-table');
    const grid = live.getByRole('grid');
    await grid.scrollIntoViewIfNeeded();
    const site = grid.getByRole('columnheader', { name: 'Site' });
    await expect(site).toHaveAttribute('aria-sort', 'ascending');
    await site.focus();
    await page.keyboard.press('Enter');
    await expect(site).toHaveAttribute('aria-sort', 'descending');
    await page.keyboard.press('Enter');
    await expect(site).toHaveAttribute('aria-sort', 'ascending');

    const rows = grid.getByRole('row');
    await rows.nth(1).focus();
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live.getByTestId('row-action')).toHaveText(/^Row action: open \S+\.$/);
    await page.keyboard.press('Space');
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Slider and RangeSlider', () => {
  test('Slider: arrows, PageUp, Home and End change the value, the thumb is named and the value text is words', async ({ page }) => {
    await openSection(page, 'slider');
    const live = await liveCell(page, 'slider');
    const position = live.getByRole('slider', { name: 'Playback position' });
    await position.scrollIntoViewIfNeeded();
    await position.focus();
    await expect(position).toHaveAttribute('aria-valuetext', /^\d+:\d{2} of \d+:\d{2}$/);
    const start = Number(await position.inputValue());
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(start);
    await page.keyboard.press('PageUp');
    await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(start + 1);
    await page.keyboard.press('End');
    await expect(position).toHaveAttribute('aria-valuetext', /^(\d+):(\d{2}) of \1:\2$/);
    await page.keyboard.press('Home');
    await expect(position).toHaveValue('0');
  });

  test('RangeSlider: both thumbs are named, say their value in Hz and the lower thumb cannot pass the upper', async ({ page }) => {
    await openSection(page, 'slider');
    const live = await liveCell(page, 'slider');
    const minimum = live.getByRole('slider', { name: 'Frequency range minimum' });
    const maximum = live.getByRole('slider', { name: 'Frequency range maximum' });
    await minimum.scrollIntoViewIfNeeded();
    await expect(minimum).toHaveAttribute('aria-valuetext', /^[\d,]+ Hz$/);
    await expect(maximum).toHaveAttribute('aria-valuetext', /^[\d,]+ Hz$/);
    await minimum.focus();
    const before = Number(await minimum.inputValue());
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await minimum.inputValue())).toBeGreaterThan(before);
    await page.keyboard.press('End');
    // The lower thumb stops where the upper one is.
    await expect
      .poll(async () => (await minimum.inputValue()) === (await maximum.inputValue()))
      .toBe(true);
    const crossed = await maximum.inputValue();
    await page.keyboard.press('Tab');
    await expect(maximum).toBeFocused();
    // Home on the upper thumb would cross the lower one, so it is refused: the state is the one it started in, which
    // an assertion resolves at once. Give a wrongly handled press its frames, then assert (D-WR-05).
    await page.keyboard.press('Home');
    await settleFrames(page);
    await expect(maximum).toHaveValue(crossed);
    await expect(minimum).toHaveValue(crossed);
    // Positive control: keys do reach the lower thumb, and it moves down off the upper one.
    await page.keyboard.press('Shift+Tab');
    await expect(minimum).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => Number(await minimum.inputValue())).toBeLessThan(Number(crossed));
    await expect(maximum).toHaveValue(crossed);
  });
});

test.describe('ToggleGroup and BandToggle', () => {
  test('ToggleGroup: arrows move focus between segments and Space toggles', async ({ page }) => {
    await openSection(page, 'toggle-group');
    const group = page.locator('section#toggle-group').getByRole('radiogroup', { name: 'Options, default' });
    await group.scrollIntoViewIfNeeded();
    const segments = group.getByRole('radio');
    await segments.first().focus();
    await expect(segments.first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(segments.nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(segments.nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(segments.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(segments.nth(1)).toBeFocused();
  });

  test('BandToggle keeps one band on', async ({ page }) => {
    await openSection(page, 'band-toggle');
    const group = (await liveCell(page, 'band-toggle')).getByRole('toolbar', { name: 'Frequency bands to play' });
    await group.scrollIntoViewIfNeeded();
    const low = group.getByRole('button', { name: /^Low/ });
    const mid = group.getByRole('button', { name: /^Mid/ });
    const high = group.getByRole('button', { name: /^High/ });
    await expect(low).toHaveAttribute('aria-pressed', 'true');
    await expect(mid).toHaveAttribute('aria-pressed', 'true');
    await expect(high).toHaveAttribute('aria-pressed', 'false');
    await low.focus();
    await page.keyboard.press('Space');
    await expect(low).toHaveAttribute('aria-pressed', 'false');
    // Positive control: turn High on, so the Space presses below are known to reach the toolbar, then turn Mid off.
    await page.keyboard.press('ArrowRight');
    await expect(mid).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(high).toBeFocused();
    await page.keyboard.press('Space');
    await expect(high).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(mid).toBeFocused();
    await page.keyboard.press('Space');
    await expect(mid).toHaveAttribute('aria-pressed', 'false');
    // High is now the last band on, and it cannot be turned off. A refused press leaves the state it started in, so
    // wait for the press's frames before asserting (D-WR-05).
    await page.keyboard.press('ArrowRight');
    await expect(high).toBeFocused();
    await page.keyboard.press('Space');
    await settleFrames(page);
    await expect(high).toHaveAttribute('aria-pressed', 'true');
    await expect(low).toHaveAttribute('aria-pressed', 'false');
    await expect(mid).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Tooltip', () => {
  test('focusing the trigger shows role="tooltip", Escape hides it and focus stays', async ({ page }) => {
    await openSection(page, 'tooltip');
    // React Aria opens a tooltip on focus only when focus came from the keyboard, and closes it when
    // the page scrolls, so park the pointer, reach the trigger with real Tab presses, then step off
    // and back on once the page has settled (the first Tab onto an off-screen trigger scrolls).
    await page.mouse.move(0, 0);
    const trigger = page.getByTestId('tooltip-live-trigger');
    const tip = page
      .locator('[role="tooltip"][data-placement]')
      .filter({ hasText: 'Assigned by the dataset authors, not by the model.' });
    await expect(tip).toHaveCount(0);
    await startTabbing(page);
    await tabTo(page, trigger);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe('CommandPalette', () => {
  const paletteOf = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

  test('Control+K opens, typing filters and the live region counts, ArrowDown moves, Enter runs and closes', async ({ page }) => {
    await openSection(page, 'command-palette');
    await page.keyboard.press('Control+k');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('searchbox', { name: 'Search' });
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('status')).toHaveText(/^\d+ results$/);
    await page.keyboard.type('ind_h');
    // The announced count and the visible results agree, whatever the filter keeps.
    await expect
      .poll(async () => {
        const announced = Number(((await dialog.getByRole('status').textContent()) ?? '').replace(/\D/g, ''));
        return announced > 0 && announced === (await dialog.getByRole('option').count());
      })
      .toBe(true);
    await expect.poll(async () => input.getAttribute('aria-activedescendant')).toBeTruthy();
    const first = await input.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => input.getAttribute('aria-activedescendant')).not.toBe(first);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(stateCell(page, 'command-palette', 'closed').getByTestId('palette-action')).toHaveText(/^Result run: /);
  });

  test('Escape closes in one press and focus returns to the opener', async ({ page }) => {
    await openSection(page, 'command-palette');
    const opener = stateCell(page, 'command-palette', 'closed').getByRole('button', { name: 'Open command palette' });
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = paletteOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('Transport', () => {
  async function liveTransport(page: Page): Promise<{ group: Locator; readout: Locator }> {
    await openSection(page, 'transport');
    const live = await liveCell(page, 'transport');
    const group = live.getByRole('group', { name: 'Playback', exact: true });
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    return { group, readout: group.getByTestId('transport-readout') };
  }

  test('ArrowRight advances 5 s, Home returns to the start and Space toggles Play and Pause', async ({ page }) => {
    const { group, readout } = await liveTransport(page);
    await group.getByRole('button', { name: 'Play' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(readout).toHaveText(/^00:05\.0 \/ /);
    await page.keyboard.press('ArrowRight');
    await expect(readout).toHaveText(/^00:10\.0 \/ /);
    await page.keyboard.press('Home');
    await expect(readout).toHaveText(/^00:00\.0 \/ /);
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await expect(group.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await expect(group.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});

test.describe('WindowStrip', () => {
  test('one tab stop; ArrowRight moves, End jumps to the last window and Enter selects it', async ({ page }) => {
    await openSection(page, 'window-strip');
    const live = await liveCell(page, 'window-strip');
    const group = live.getByRole('group', { name: 'Playback', exact: true });
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    const strip = live.getByRole('listbox');
    const cells = strip.getByRole('option');
    await cells.first().focus();
    await expect(cells.first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cells.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(cells.last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cells.last()).toHaveAttribute('aria-selected', 'true');
    // The selected window carries its 3 px ink outline.
    await expect
      .poll(async () =>
        cells.last().evaluate((node) => {
          const outline = node.querySelector('span[class*="border-[3px]"]') as HTMLElement | null;
          if (outline === null) return null;
          const style = getComputedStyle(outline);
          return { width: style.borderTopWidth, visible: style.borderTopColor !== 'rgba(0, 0, 0, 0)' && style.borderTopColor !== 'transparent' };
        }),
      )
      .toEqual({ width: '3px', visible: true });
    // One tab stop: Tab leaves the strip.
    await page.keyboard.press('Tab');
    await expect.poll(() => focusIsInside(strip)).toBe(false);
  });
});

test.describe('Crossfader', () => {
  test('ArrowRight moves the mix 5 and the value text names both recordings', async ({ page }) => {
    await openSection(page, 'compare');
    const live = await liveCell(page, 'compare');
    const slider = live.getByRole('slider', { name: 'Mix between A and B' });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toHaveAttribute('aria-valuetext', '50% A, 50% B');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '45% A, 55% B');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', '100% A, 0% B');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '0% A, 100% B');
  });
});
