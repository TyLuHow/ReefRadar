import { FIXTURE_SLUGS } from '../../../src/features/fixtures/slugs';

/**
 * What the /dev/fixtures screenshot spec (tests/e2e/fixtures.spec.ts, 04-23) captures, and the file
 * name of every capture. The baseline-set unit test of plan 04-24 builds the expected directory
 * listing from this module, so the spec and that guard can never disagree about the names.
 *
 * Atlas (the default direction) is captured for every section at four widths. The two alternate
 * directions get a representative set at the widest and the narrowest width: their remaining states
 * are covered by the axe and contrast gates (04-22, 04-05), because a direction is one token block.
 *
 * This module holds names and sizes only, so a unit test can import it without a browser.
 */

export interface ShotWidth {
  label: string;
  width: number;
  height: number;
}

/** The four widths every atlas section is captured at. Heights are the viewport; the shot is the section element. */
export const SHOT_WIDTHS: readonly ShotWidth[] = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '768', width: 768, height: 1024 },
  { label: '390', width: 390, height: 844 },
];

export const ALTERNATE_DIRECTIONS = ['nocturne', 'poster'] as const;
export type AlternateDirection = (typeof ALTERNATE_DIRECTIONS)[number];

/** The two widths the alternate directions are captured at. */
export const ALTERNATE_WIDTH_LABELS = ['1440', '390'] as const;

/** The suffix Playwright adds under the fixtures-shots snapshot template on Linux (the CI image). */
export const SNAPSHOT_SUFFIX = '-fixtures-shots-linux.png';

/** Whole sections captured for the alternate directions. */
export const ALTERNATE_SECTIONS: readonly string[] = [
  'tokens',
  'status-palette',
  'legend',
  'status-band',
  'composition-inspector',
  'composition-listen',
  'composition-compare',
  'composition-explore',
];

/**
 * Single state cells captured for the alternate directions: `slug` is the section and also the
 * `data-fixture-primitive` of the cell, `state` is its `data-fixture-state` as the section renders it.
 */
export const ALTERNATE_CELLS: readonly { slug: string; state: string }[] = [
  { slug: 'spectrogram', state: 'hero' },
  { slug: 'transport', state: 'default' },
  { slug: 'transport', state: 'large' },
  { slug: 'probability-bar', state: 'default' },
  { slug: 'probability-bar', state: 'abstain' },
  { slug: 'data-table', state: 'default' },
];

export interface AtlasShot {
  slug: string;
  width: ShotWidth;
  /** Screenshot name as passed to toHaveScreenshot (the project, platform and extension are appended). */
  name: string;
}

export interface AlternateShot {
  slug: string;
  /** Set for a single-cell shot; absent for a whole-section shot. */
  state?: string;
  direction: AlternateDirection;
  width: ShotWidth;
  name: string;
}

export function atlasShotName(slug: string, widthLabel: string): string {
  return `${slug}-atlas-${widthLabel}.png`;
}

export function alternateShotName(slug: string, state: string | undefined, direction: string, widthLabel: string): string {
  return state === undefined ? `${slug}-${direction}-${widthLabel}.png` : `${slug}-${state}-${direction}-${widthLabel}.png`;
}

/** Every atlas capture: each registered section at each of the four widths. */
export const ATLAS_SHOTS: readonly AtlasShot[] = FIXTURE_SLUGS.flatMap((slug) =>
  SHOT_WIDTHS.map((width) => ({ slug, width, name: atlasShotName(slug, width.label) })),
);

const ALTERNATE_WIDTHS = SHOT_WIDTHS.filter((width) => (ALTERNATE_WIDTH_LABELS as readonly string[]).includes(width.label));

/** Every alternate-direction capture: the representative sections and cells, per direction, at 1440 and 390. */
export const ALTERNATE_SHOTS: readonly AlternateShot[] = ALTERNATE_DIRECTIONS.flatMap((direction) =>
  ALTERNATE_WIDTHS.flatMap((width) => [
    ...ALTERNATE_SECTIONS.map((slug) => ({
      slug,
      direction,
      width,
      name: alternateShotName(slug, undefined, direction, width.label),
    })),
    ...ALTERNATE_CELLS.map(({ slug, state }) => ({
      slug,
      state,
      direction,
      width,
      name: alternateShotName(slug, state, direction, width.label),
    })),
  ]),
);

/** Every screenshot name the spec produces, with the Linux snapshot suffix, as the baseline directory should list them. */
export function expectedBaselineFiles(): string[] {
  return [...ATLAS_SHOTS, ...ALTERNATE_SHOTS].map((shot) => shot.name.replace(/\.png$/, SNAPSHOT_SUFFIX));
}
