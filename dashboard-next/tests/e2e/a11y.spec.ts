import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';
import { STATES } from './support/states';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/**
 * Accessibility regression gate (01-08, D-21/D-22).
 *
 * Runs axe at 1440 (desktop) for every state, against the pre-truth
 * baseline (tests/baseline/pre-truth/axe/summary.json) captured before any
 * legacy-UI change in this phase. Only NEW serious/critical rule
 * violations fail the test — zero-violation enforcement is Phase 16. This
 * is a regression gate, not an accessibility compliance claim.
 */

interface BaselineRule {
  id: string;
  impact: string;
  nodes: number;
}

const SUMMARY_PATH = path.join(
  __dirname,
  '..',
  'baseline',
  'pre-truth',
  'axe',
  'summary.json'
);

const BASELINE: Record<string, BaselineRule[]> = JSON.parse(
  fs.readFileSync(SUMMARY_PATH, 'utf-8')
);

/**
 * Rules the pre-truth baseline could not see. While the ambient canvases sat
 * behind the /experience states, axe could not compute a background colour and
 * reported colour contrast as "incomplete" instead of a violation. With the
 * canvases removed (03-06) axe measures the real, unchanged colours. These are
 * the same muted-text-on-dark-surface contrast defects the baseline already
 * records for landing, about, dashboard, compare and analyze; no colour changed.
 * Zero-violation enforcement is Phase 16, so the rule is allowed for exactly
 * these states and nothing else.
 */
const UNMASKED_BY_CANVAS_REMOVAL: Record<string, string[]> = {
  experience: ['color-contrast'],
  'experience-demo': ['color-contrast'],
  'experience-compare': ['color-contrast'],
  'experience-sample': ['color-contrast'],
};

function baselineRuleIds(stateName: string): Set<string> {
  return new Set([
    ...(BASELINE[stateName] ?? []).map((r) => r.id),
    ...(UNMASKED_BY_CANVAS_REMOVAL[stateName] ?? []),
  ]);
}

test.describe('a11y regression', () => {
  for (const state of STATES) {
    test(`${state.name} has no new serious/critical violations`, async ({ page }) => {
      await mockApi(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(state.path, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      // Mirror the pre-truth baseline capture's settle time (canvas/WebGL
      // ambience, animated gradients) so contrast checks run against the
      // same visual state the baseline was captured from.
      await page.waitForTimeout(2000);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );
      const known = baselineRuleIds(state.name);
      const newViolationIds = seriousOrCritical
        .map((v) => v.id)
        .filter((id) => !known.has(id));

      expect(
        newViolationIds,
        `new serious/critical axe rule(s) not present in the pre-truth baseline for "${state.name}": ` +
          `${newViolationIds.join(', ')}`
      ).toEqual([]);
    });
  }
});
