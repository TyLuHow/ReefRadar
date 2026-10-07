import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { openSection, settleFrames } from './support/fixtures';
import { ALTERNATE_SHOTS, ATLAS_SHOTS, expectedBaselineFiles } from './support/fixture-shots';

/**
 * Screenshot visual regression of the /dev/fixtures design-system route (04-23, DS-08).
 *
 * Runs only in the fixtures-shots Playwright project, and only produces comparable images inside the
 * official Playwright Docker image (CI, Linux), so it self-skips unless PW_VISUAL=1. Its baselines
 * live in their own directory and are produced only by the CI update_snapshots dispatch (plan 04-24),
 * never locally: the spectrogram canvases and the web fonts are deterministic only in that pinned
 * image. The 33 legacy baselines belong to visual.spec.ts and are not touched here.
 *
 * The baselines are committed (04-24). In CI the gate fails closed: a missing PW_VISUAL, a missing baseline
 * directory or a baseline set that is not complete fails every test instead of skipping it, so the gate can never
 * turn into a silent no-op. The one exception is the dispatch update path (PW_UPDATE=1), which is how baselines are
 * written. Locally it still skips.
 *
 * Determinism, per capture:
 *  - Readiness: openSection waits for every cell the state manifest lists, for web fonts
 *    (document.fonts.ready), for every contract-backed cell to leave its loading placeholder, for
 *    network idle, for no stray aria-busy, and for every canvas well to report data-ready.
 *  - Motion: the project emulates prefers-reduced-motion, which the kit honours (04-22 proves it),
 *    and toHaveScreenshot freezes any remaining CSS animation with animations: 'disabled'.
 *  - Canvases: the spectrogram and waveform wells are drawn once from committed audio excerpts and
 *    are NOT hidden; a baseline without them would prove nothing.
 *  - The one masked region is [data-visual="skip"], the WebGL token-probe map, whose GPU raster is
 *    not reproducible across renderers; the swatches and the table beside it carry the same
 *    information and are captured.
 *  - The clock: sections draw no wall-clock value (forced positions such as 12.4 s are fixed props);
 *    two nested animation frames let the last paint land before the capture.
 */

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const SNAPSHOT_DIR = path.join(__dirname, 'fixtures.spec.ts-snapshots');

/** The baselines the spec expects (the same names the baseline-set unit test checks) that are not in the directory. */
function missingBaselines(): string[] {
  const present = new Set(fs.existsSync(SNAPSHOT_DIR) ? fs.readdirSync(SNAPSHOT_DIR) : []);
  return expectedBaselineFiles().filter((file) => !present.has(file));
}

// In CI the gate must never silently turn into a no-op: a deleted or empty baseline directory would
// otherwise skip every test and leave CI green with zero visual verification. Locally it still skips.
const FAIL_WITHOUT_BASELINES = process.env.CI === 'true' || process.env.CI === '1';

/** Skip unless this is the pinned visual run; in CI fail instead of skipping (except on the dispatch update path). */
function gate(): void {
  const updating = process.env.PW_UPDATE === '1';
  if (process.env.PW_VISUAL !== '1') {
    if (FAIL_WITHOUT_BASELINES && !updating) {
      throw new Error('The fixtures-shots project needs PW_VISUAL=1 in CI: skipping would leave CI green with zero visual verification.');
    }
    test.skip(true, 'Visual regression only runs with PW_VISUAL=1 (Docker-pinned Linux CI).');
  }
  if (updating) return;
  const missing = missingBaselines();
  if (missing.length > 0) {
    if (FAIL_WITHOUT_BASELINES) {
      throw new Error(
        `PW_VISUAL=1 in CI but ${missing.length} of ${expectedBaselineFiles().length} fixtures baselines are missing from ` +
          `tests/e2e/fixtures.spec.ts-snapshots (first: ${missing[0]}). Regenerate them with the update_snapshots workflow input.`,
      );
    }
    test.skip(true, 'No complete set of fixtures baselines yet; generate them with the update_snapshots dispatch.');
  }
}

const MASK = '[data-visual="skip"]';

test.describe('atlas, every section at four widths', () => {
  for (const shot of ATLAS_SHOTS) {
    test(`${shot.slug} @ ${shot.width.label}`, async ({ page }) => {
      gate();
      await page.setViewportSize({ width: shot.width.width, height: shot.width.height });
      await openSection(page, shot.slug);
      await settleFrames(page);
      await expect(page.locator(`section#${shot.slug}`)).toHaveScreenshot(shot.name, {
        mask: [page.locator(MASK)],
        animations: 'disabled',
      });
    });
  }
});

test.describe('nocturne and poster, representative set at 1440 and 390', () => {
  for (const shot of ALTERNATE_SHOTS) {
    const where = shot.state === undefined ? shot.slug : `${shot.slug}/${shot.state}`;
    test(`${where} ${shot.direction} @ ${shot.width.label}`, async ({ page }) => {
      gate();
      await page.setViewportSize({ width: shot.width.width, height: shot.width.height });
      await openSection(page, shot.slug, { direction: shot.direction });
      await settleFrames(page);
      const section = page.locator(`section#${shot.slug}`);
      const target =
        shot.state === undefined
          ? section
          : section.locator(`[data-fixture-primitive="${shot.slug}"][data-fixture-state="${shot.state}"]`).first();
      await expect(target).toHaveCount(1);
      await expect(target).toHaveScreenshot(shot.name, {
        mask: [page.locator(MASK)],
        animations: 'disabled',
      });
    });
  }
});
