import { expect, type Locator, type Page } from '@playwright/test';
import { FIXTURE_STATE_MANIFEST } from '../../../src/features/fixtures/state-manifest';
import { mockApi } from './mock-api';

/**
 * Shared helpers for the /dev/fixtures browser gates (04-22): keyboard, axe, touch targets, reduced
 * motion, legacy isolation and the state manifest.
 *
 * Every helper waits for a STATE, never for time, because React Aria, the clock and the canvases
 * settle on the next frame: the chrome (the Direction radiogroup) only exists once the client has
 * rendered, so a press is never lost to hydration; the contract-backed cells show a "-loading"
 * placeholder until their data arrives; and each spectrogram or waveform well reports
 * data-ready="true" once it has drawn.
 */

export const SURFACE = '[data-surface="instrument"]';

export const DIRECTION_NAMES = ['atlas', 'nocturne', 'poster'] as const;
export type DirectionName = (typeof DIRECTION_NAMES)[number];

export interface OpenSectionOptions {
  /** `?direction=`; omitted for the default (atlas). */
  direction?: DirectionName;
  /** `?reduced=1` (the Reduced motion toggle's URL form). */
  reduced?: boolean;
  /** `?tok=--dir-x:#RRGGBB` overrides. */
  tok?: string[];
  /**
   * Wait for every cell the state manifest lists before settling (default true), so a page that is
   * still mounting is never measured half-rendered. The state-manifest spec turns this off because
   * it asserts those cells itself.
   */
  waitForCells?: boolean;
}

/** Pages that already have the API and contract mock, so a spec that also installs it is not doubled. */
const MOCKED = new WeakSet<Page>();

/** Install the API and contract mock once per page. Pair with `expectNoUnhandledApiCalls` in afterEach. */
export async function ensureMocked(page: Page): Promise<void> {
  if (MOCKED.has(page)) return;
  MOCKED.add(page);
  await mockApi(page);
}

export function sectionUrl(slug: string, opts: OpenSectionOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.direction !== undefined && opts.direction !== 'atlas') params.set('direction', opts.direction);
  if (opts.reduced === true) params.set('reduced', '1');
  for (const token of opts.tok ?? []) params.append('tok', token);
  const qs = params.toString();
  return `/dev/fixtures/${slug}/${qs === '' ? '' : `?${qs}`}`;
}

/**
 * Open one section page and wait until it is settled: the client has rendered the chrome, web fonts
 * are ready, no contract-backed cell is still a loading placeholder and every canvas well has drawn.
 */
export async function openSection(page: Page, slug: string, opts: OpenSectionOptions = {}): Promise<void> {
  await ensureMocked(page);
  await page.goto(sectionUrl(slug, opts), { waitUntil: 'load' });
  await expect(page.locator(SURFACE)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const section = page.locator(`section#${slug}`);
  await expect(section).toHaveCount(1);
  // Every cell the manifest lists is mounted: without this a page still mounting would pass every
  // "nothing is loading" check below vacuously.
  if (opts.waitForCells !== false) {
    for (const state of FIXTURE_STATE_MANIFEST[slug] ?? []) {
      await expect(section.locator(`[data-fixture-state="${state}"]`).first(), `${slug}/${state}`).toBeAttached();
    }
  }
  // Contract-backed cells show a "...-loading" placeholder until the data has arrived.
  await expect(section.locator('[data-fixture-state$="-loading"]')).toHaveCount(0);
  // The committed audio excerpts and the contract have been fetched.
  await page.waitForLoadState('networkidle');
  // Nothing is still loading outside the cells that exist to show a loading or pending state.
  await expect(
    section.locator('[data-fixture-state]:not([data-fixture-state*="loading"]):not([data-fixture-state="pending"]) [aria-busy="true"]'),
  ).toHaveCount(0);
  // Every spectrogram and waveform well in the section has drawn.
  await expect(section.locator('[data-ready="false"]')).toHaveCount(0);
}

/**
 * The interactive cell of a primitive: the first of `live`, `default` or `closed` that exists in its
 * section (earlier plans give their interactive cell one of those ids).
 */
export async function liveCell(page: Page, primitive: string): Promise<Locator> {
  for (const state of ['live', 'default', 'closed']) {
    const cell = page.locator(`[data-fixture-primitive="${primitive}"][data-fixture-state="${state}"]`);
    if ((await cell.count()) > 0) return cell.first();
  }
  throw new Error(`No live, default or closed cell for primitive "${primitive}"`);
}

/** One named state cell of a section. */
export function stateCell(page: Page, primitive: string, state: string): Locator {
  return page.locator(`[data-fixture-primitive="${primitive}"][data-fixture-state="${state}"]`);
}

/** The instrument surface root. */
export function surface(page: Page): Locator {
  return page.locator(SURFACE);
}

/** Start a Tab sweep from the control just before the sections (the Reduced motion toggle). */
export async function startTabbing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reduced motion' }).focus();
}

/**
 * Press Tab until `target` has focus, so the keyboard contract is proven from the real tab order and
 * not from a programmatic focus() call. Bounded: the section list at 1024 px and up is a tab stop
 * per link, so a section's first control is dozens of presses in.
 */
export async function tabTo(page: Page, target: Locator, max = 150): Promise<void> {
  for (let presses = 0; presses < max; presses += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** True while the element behind `inside` contains the focused element. */
export async function focusIsInside(inside: Locator): Promise<boolean> {
  return inside.evaluate((node) => node.contains(document.activeElement));
}

/**
 * Wait for two animation frames. A refused key press ("the last band cannot be turned off", "the thumbs cannot
 * cross") leaves the state it started in, so a web-first assertion on that state resolves at once; this gives a
 * wrongly handled press its frames to show before the unchanged state is asserted. Pair it with a positive control
 * that proves keys reach the control.
 */
export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
