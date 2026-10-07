import { test, expect, type Page } from '@playwright/test';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { SURFACE, liveCell, openSection } from './support/fixtures';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';

/**
 * Reduced motion (04-22, DS-06): with the OS preference or the Reduced motion toggle, nothing in any
 * section animates, every element computes a zero transition duration, and playback advances the
 * playhead in 1 s steps with no requestAnimationFrame calls. And with motion allowed, no frame loop
 * runs while idle.
 *
 * Real-device performance budgets are Phase 16 (backstop); this spec proves the contract in
 * Chromium by counting requestAnimationFrame calls and reading computed styles.
 */

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/** Wrap requestAnimationFrame with a counter before any page script runs. */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __rafCalls: number };
    w.__rafCalls = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      w.__rafCalls += 1;
      return original(callback);
    };
  });
}

const frameCalls = (page: Page) => page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
const resetFrames = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __rafCalls: number }).__rafCalls = 0;
  });

/** Running animations, and the elements in the surface whose transition-duration is not all 0s. */
async function motionVerdict(page: Page): Promise<{ animations: number; transitions: string[] }> {
  return page.evaluate((surface) => {
    const root = document.querySelector(surface) as HTMLElement;
    const transitions: string[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
      const durations = getComputedStyle(el).transitionDuration.split(',').map((value) => value.trim());
      if (durations.some((value) => value !== '0s')) {
        const cell = el.closest('[data-fixture-state]');
        const where = cell ? `${cell.getAttribute('data-fixture-primitive')}/${cell.getAttribute('data-fixture-state')} ` : '';
        transitions.push(`${where}${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 60)}: ${durations.join(',')}`);
      }
    }
    return { animations: document.getAnimations().length, transitions: transitions.slice(0, 5) };
  }, SURFACE);
}

test.describe('with the OS preference (prefers-reduced-motion: reduce)', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const slug of FIXTURE_SLUGS) {
    test(`${slug}: no running animation and every transition is 0s`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, slug);
      // Poll, never wait a fixed time: an entrance animation that is going to run has started by now,
      // and one that was wrongly left running keeps the count above zero.
      await expect.poll(() => motionVerdict(page)).toEqual({ animations: 0, transitions: [] });
    });
  }
});

test.describe('with the Reduced motion toggle (?reduced=1) and no OS preference', () => {
  for (const slug of ['motion', 'transport', 'compare', 'sheet']) {
    test(`${slug}: no running animation and every transition is 0s`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, slug, { reduced: true });
      await expect(page.locator(SURFACE)).toHaveAttribute('data-reduced-motion', 'true');
      await expect.poll(() => motionVerdict(page)).toEqual({ animations: 0, transitions: [] });
    });
  }
});

test.describe('the probe is live', () => {
  test('with motion allowed the same probe finds transitions, so a zero above means something', async ({ page }) => {
    await openSection(page, 'button');
    await expect.poll(async () => (await motionVerdict(page)).transitions.length).toBeGreaterThan(0);
  });
});

test.describe('the frame loop', () => {
  test('motion allowed: no requestAnimationFrame call runs while the page is idle', async ({ page }) => {
    await countFrames(page);
    await openSection(page, 'transport');
    // Let anything started by the load finish, then watch a quiet second.
    await page.waitForTimeout(1000);
    await resetFrames(page);
    await page.waitForTimeout(1000);
    expect(await frameCalls(page)).toBe(0);
  });

  test('the counter is live: motion allowed and playing, the playhead runs a frame loop', async ({ page }) => {
    await countFrames(page);
    await openSection(page, 'transport');
    const live = await liveCell(page, 'transport');
    const group = live.getByRole('group', { name: 'Playback', exact: true });
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await resetFrames(page);
    await group.getByRole('button', { name: 'Play' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
    await expect.poll(() => frameCalls(page)).toBeGreaterThan(0);
    await group.getByRole('button', { name: 'Pause' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('playing steps the playhead and the readout once per second with no requestAnimationFrame call', async ({ page }) => {
      await countFrames(page);
      await openSection(page, 'transport');
      const live = await liveCell(page, 'transport');
      const group = live.getByRole('group', { name: 'Playback', exact: true });
      await expect(group).toHaveAttribute('data-transport-status', 'idle');
      const playhead = live.locator('[data-playhead]').first();
      const readout = group.getByTestId('transport-readout');
      const transformOf = () => playhead.evaluate((el) => (el as HTMLElement).style.transform);
      // The transform is set by an effect: capture it only once it exists, so '' before mount cannot pass not.toBe(before).
      await expect.poll(transformOf).not.toBe('');
      const before = await transformOf();
      await expect(readout).toHaveText(/^00:00\.0 \//);

      await group.getByRole('button', { name: 'Play' }).click();
      await expect(group).toHaveAttribute('data-transport-status', 'playing');
      await resetFrames(page);
      // 1.5 s covers at least one 1 Hz tick: the playhead and the readout move, and no frame was requested.
      // Wait for the tick to have happened first, so the zero-frames assertion is made after the clock advanced.
      await expect(readout).not.toHaveText(/^00:00\.0 \//);
      await expect.poll(transformOf).not.toBe(before);
      expect(await frameCalls(page)).toBe(0);

      await group.getByRole('button', { name: 'Pause' }).click();
      await expect(group).toHaveAttribute('data-transport-status', 'idle');
    });
  });
});

