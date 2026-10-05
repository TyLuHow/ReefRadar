import { test, expect } from '@playwright/test';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { openSection } from './support/fixtures';
import { FIXTURE_STATE_MANIFEST } from '../../src/features/fixtures/state-manifest';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';

/**
 * Every state named in the UI-SPEC tables (as adjusted by CONTEXT) has a rendered cell (04-22, DS-08).
 * FIXTURE_STATE_MANIFEST lists them per section; this opens each section page and asserts a
 * `[data-fixture-primitive][data-fixture-state="{state}"]` cell exists for every listed state. A
 * Playwright spec rather than a unit test, because cells such as the spectrogram, the strips and the
 * plots need a real browser (canvas, audio, Plot).
 */

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

test.describe('the manifest and the section list agree', () => {
  test('every manifest slug is a registered section', () => {
    expect(Object.keys(FIXTURE_STATE_MANIFEST).filter((slug) => !FIXTURE_SLUGS.includes(slug))).toEqual([]);
  });

  test('every registered section has a manifest entry with at least one state', () => {
    expect(FIXTURE_SLUGS.filter((slug) => (FIXTURE_STATE_MANIFEST[slug] ?? []).length === 0)).toEqual([]);
  });

  test('no manifest entry lists the same state twice', () => {
    const repeated = Object.entries(FIXTURE_STATE_MANIFEST).flatMap(([slug, states]) =>
      states.filter((state, index) => states.indexOf(state) !== index).map((state) => `${slug}/${state}`),
    );
    expect(repeated).toEqual([]);
  });
});

/**
 * The success criterion names the empty, loading and error states of thirteen primitives. Their
 * ids per the UI-SPEC tables are written out here, independently of the manifest, so shrinking the
 * manifest cannot quietly drop one. A state that a table marks n/a is not listed: Legend and
 * StatusBand have no error cell (the parent's Error shows), and the CommandPalette's empty state is
 * "no results".
 */
const EMPTY_LOADING_ERROR: Record<string, string[]> = {
  listbox: ['loading', 'empty', 'error'],
  'data-table': ['loading', 'empty', 'error'],
  legend: ['loading', 'empty'],
  'status-band': ['loading', 'empty'],
  'window-strip': ['loading', 'empty', 'error'],
  'strip-plot': ['loading', 'empty', 'error'],
  'command-palette': ['loading', 'no-results', 'error'],
  spectrogram: ['loading', 'empty', 'error'],
  transport: ['loading', 'empty', 'error'],
  'probability-bar': ['loading', 'empty', 'error'],
  // CompareRow: loading, "Empty slot", and the per-row error.
  compare: ['loading', 'empty-slot', 'error-row'],
  // The Why panel (ProvenanceChip): loading, empty (the missing kind) and error.
  provenance: ['loading', 'empty', 'error'],
  'band-toggle': ['loading', 'empty', 'error'],
};

test.describe('the empty, loading and error states are in the manifest', () => {
  for (const [slug, states] of Object.entries(EMPTY_LOADING_ERROR)) {
    test(`${slug} lists ${states.join(', ')}`, () => {
      const listed = FIXTURE_STATE_MANIFEST[slug] ?? [];
      expect(states.filter((state) => !listed.includes(state))).toEqual([]);
    });
  }
});

test.describe('every manifest cell is rendered', () => {
  for (const slug of FIXTURE_SLUGS) {
    test(`${slug}: ${(FIXTURE_STATE_MANIFEST[slug] ?? []).length} cells`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, slug, { waitForCells: false });
      const section = page.locator(`section#${slug}`);
      for (const state of FIXTURE_STATE_MANIFEST[slug] ?? []) {
        await expect(
          section.locator(`[data-fixture-primitive][data-fixture-state="${state}"]`).first(),
          `${slug}: no cell with data-fixture-state="${state}"`,
        ).toBeAttached();
      }
    });
  }
});
