import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';
import { STATES } from './support/states';

/**
 * Route smoke suite (01-08, D-22).
 *
 * Exercises every legacy route (same 11 states as the pre-truth baseline,
 * tests/e2e/baseline-live.spec.ts) against a local `next start` with the
 * API fully mocked by committed fixtures — never the live API. Fails on
 * any uncaught page error or same-origin HTTP response >= 400, except
 * known pre-existing defects that a later plan in this phase removes.
 */

interface KnownDefect {
  /** Substring matched against the request pathname. */
  pathIncludes: string;
  /** Plan id (this phase) that removes this defect. */
  removedByPlan: string;
  reason: string;
}

// KNOWN_DEFECTS: pre-existing defects a later plan in this phase fixes.
// A request matching an entry here is ignored by the >=400 check below;
// anything else fails the test.
const KNOWN_DEFECTS: KnownDefect[] = [
  {
    pathIncludes: '/audio/compare/',
    removedByPlan: '01-17',
    reason:
      'Location Compare manifest/audio files 404 today for most locations (PRODUCT-AUDIT.md §3.2); ' +
      'plan 01-17 replaces the manifest with real-audio entries only.',
  },
];

function isKnownDefect(pathname: string): boolean {
  return KNOWN_DEFECTS.some((d) => pathname.includes(d.pathIncludes));
}

// /experience/?mode=... and /experience/?sample=... all mount the 'landing'
// state first (useReducer initial state), then an effect reads the query
// param and dispatches a transition to DemoState / LocationCompare /
// SamplePlaybackState — none of which render a page-level <h1> (confirmed
// against source: no <h1>/<h2> in DemoState.tsx, LocationCompare.tsx, or
// SamplePlaybackState in experience/page.tsx). Asserting <h1> visibility on
// these is racy against that transition (it would pass or fail depending on
// whether the check runs before or after the landing h1 unmounts), so these
// three states are exempted rather than producing a flaky gate.
const STATES_WITHOUT_H1 = new Set(['experience-demo', 'experience-compare', 'experience-sample']);

async function assertCleanLoad(page: Page, statePath: string) {
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url() || 'http://localhost:3100').origin) return;
    if (response.status() < 400) return;
    if (isKnownDefect(url.pathname)) return;
    badResponses.push(`${response.status()} ${url.pathname}`);
  });

  await page.goto(statePath, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  expect(pageErrors, `uncaught page errors on ${statePath}`).toEqual([]);
  expect(badResponses, `unexpected >=400 same-origin responses on ${statePath}`).toEqual([]);
}

test.describe('route smoke', () => {
  for (const state of STATES) {
    test(`${state.name} loads cleanly`, async ({ page }) => {
      await mockApi(page);
      await assertCleanLoad(page, state.path);
      if (!STATES_WITHOUT_H1.has(state.name)) {
        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible({ timeout: 15000 });
      }
    });
  }
});
