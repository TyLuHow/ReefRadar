import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { DIRECTION_NAMES, SURFACE, openSection, stateCell } from './support/fixtures';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';

/**
 * axe on every /dev/fixtures/<section>/ page in all three directions (04-22, DS-04, DS-08), plus one
 * live overlay per overlay primitive with it open.
 *
 * Rules: wcag2a, wcag2aa and wcag22aa, which include colour-contrast. A serious or critical violation
 * fails the test, listing the rule id, impact and the first targets. The only exclusion is
 * [data-visual="skip"], the WebGL map canvases whose content axe cannot read (UI-SPEC "Token wiring
 * probe"). Violations are fixed in the primitives, never suppressed here (T-04-22-01).
 *
 * One test per page, so a heavy page times out alone and a failure names its section and direction.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const BAD_IMPACTS = new Set(['serious', 'critical']);

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).include(SURFACE).exclude('[data-visual="skip"]').analyze();
  return results.violations
    .filter((violation) => BAD_IMPACTS.has(violation.impact ?? ''))
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ');
      return `${violation.id} (${violation.impact}, ${violation.nodes.length} nodes): ${targets}`;
    });
}

test.describe('axe per section and direction', () => {
  for (const slug of FIXTURE_SLUGS) {
    for (const direction of DIRECTION_NAMES) {
      test(`${slug} in ${direction}`, async ({ page }) => {
        test.setTimeout(90_000);
        await openSection(page, slug, { direction });
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }
});

test.describe('the gate is live', () => {
  test('a low-contrast token override is reported as a colour-contrast violation', async ({ page }) => {
    test.setTimeout(90_000);
    // Muted text pushed to a near-ground grey: if this passed, the gate above would prove nothing.
    await openSection(page, 'tokens', { tok: ['--dir-muted:#F0F0F4'] });
    const found = await seriousViolations(page);
    expect(found.filter((line) => line.startsWith('color-contrast')).length).toBeGreaterThan(0);
  });
});

test.describe('axe with a live overlay open', () => {
  for (const direction of DIRECTION_NAMES) {
    test(`Dialog open in ${direction}`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, 'dialog', { direction });
      await page.getByRole('button', { name: 'Open dialog' }).click();
      await expect(page.locator(SURFACE).getByRole('dialog', { name: 'About this dialog' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`Sheet open in ${direction}`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, 'sheet', { direction });
      await page.getByRole('button', { name: 'Open right sheet' }).click();
      await expect(page.locator(SURFACE).getByRole('dialog', { name: 'Right sheet' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`CommandPalette open in ${direction}`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, 'command-palette', { direction });
      await page.getByRole('button', { name: 'Open command palette' }).click();
      const palette = page.locator(SURFACE).getByRole('dialog', { name: 'Command palette' });
      await expect(palette).toBeVisible();
      await expect(palette.getByRole('option').first()).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`Why panel open in ${direction}`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, 'provenance', { direction });
      await stateCell(page, 'provenance', 'default').locator('button[data-kind="source"]').click();
      await expect(page.locator(SURFACE).getByRole('dialog', { name: 'Source of this recording' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
