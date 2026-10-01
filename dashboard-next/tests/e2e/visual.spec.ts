import { test, expect, type Page } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';
import { STATES, WIDTHS } from './support/states';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * Screenshot visual-regression suite (01-08, D-21).
 *
 * Only produces meaningful, comparable screenshots inside the official
 * Playwright Docker image (CI, Linux) — local Windows runs self-skip (every
 * test below still enumerates and reports "skipped", exit 0, rather than
 * vanishing, so `npx playwright test --project=visual` is a meaningful
 * no-op locally). Linux snapshots are committed by plan 01-20; until then
 * this file skips with an annotation explaining why, rather than failing CI.
 */

const SNAPSHOT_DIR = path.join(__dirname, 'visual.spec.ts-snapshots');

function snapshotsExist(): boolean {
  return fs.existsSync(SNAPSHOT_DIR) && fs.readdirSync(SNAPSHOT_DIR).length > 0;
}

// In CI the visual gate must never silently turn into a no-op: a deleted or
// empty baseline directory would otherwise skip every test and leave CI green
// with zero visual verification (REVIEW WR-20). Locally it still skips.
const FAIL_WITHOUT_BASELINES = process.env.CI === 'true' || process.env.CI === '1';

// 1x1 transparent PNG, used to fulfil third-party map tile requests so
// screenshots are deterministic regardless of live tile-server content.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function blockMapTiles(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
  await page.route(/cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
}

for (const state of STATES) {
  for (const w of WIDTHS) {
    test(`${state.name} @ ${w.label}`, async ({ page }) => {
      test.skip(
        process.env.PW_VISUAL !== '1',
        'Visual regression only runs with PW_VISUAL=1 (Docker-pinned Linux CI).'
      );
      if (process.env.PW_UPDATE !== '1' && !snapshotsExist()) {
        if (FAIL_WITHOUT_BASELINES) {
          throw new Error(
            'PW_VISUAL=1 in CI but no visual baselines exist in tests/e2e/visual.spec.ts-snapshots. ' +
              'Refusing to skip: regenerate them with the update_snapshots workflow input.'
          );
        }
        test.skip(
          true,
          'No committed snapshots found. Run with PW_UPDATE=1 --update-snapshots to generate them.'
        );
      }

      await mockApi(page);
      await blockMapTiles(page);
      await page.setViewportSize({ width: w.width, height: w.height });
      await page.goto(state.path, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

      // Hide (not mask) nondeterministic canvases/maps: a mask paints an opaque block
      // over the whole element, and the fixed full-viewport background canvas would
      // then hide the page content above it. visibility:hidden keeps layout intact.
      await page.addStyleTag({
        content: 'canvas, .maplibregl-map, .leaflet-container { visibility: hidden !important; }',
      });

      await expect(page).toHaveScreenshot(`${state.name}-${w.label}.png`, {
        fullPage: true,
      });
    });
  }
}
