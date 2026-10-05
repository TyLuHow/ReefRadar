// @vitest-environment node
/**
 * Guards the Playwright wiring of the fixtures screenshot suite (04-23, T-04-23-01): it lives in its
 * own project so a baseline regeneration can never touch the 33 legacy visual baselines, and the
 * fixture-mocked e2e project never runs it.
 */
import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';
import { ALTERNATE_SHOTS, ATLAS_SHOTS, SHOT_WIDTHS, expectedBaselineFiles } from '../e2e/support/fixture-shots';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';

type Project = NonNullable<typeof config.projects>[number];

function project(name: string): Project {
  const found = (config.projects ?? []).find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`No Playwright project named ${name}`);
  return found;
}

/** Playwright matches a regexp against the absolute path of the file. */
function matches(pattern: unknown, file: string): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((candidate) => candidate instanceof RegExp && candidate.test(file));
}

const ROOT = 'C:/work/dashboard-next/tests/e2e';
const FIXTURES_SPEC = `${ROOT}/fixtures.spec.ts`;
const OTHERS = [
  'visual.spec.ts',
  'fixtures-route.spec.ts',
  'fixtures-a11y.spec.ts',
  'fixtures-state-manifest.spec.ts',
  'fixtures-compositions.spec.ts',
  'routes.spec.ts',
];

describe('the fixtures-shots Playwright project', () => {
  const shots = project('fixtures-shots');

  it('matches fixtures.spec.ts, with either path separator', () => {
    expect(matches(shots.testMatch, FIXTURES_SPEC)).toBe(true);
    expect(matches(shots.testMatch, 'C:\\work\\dashboard-next\\tests\\e2e\\fixtures.spec.ts')).toBe(true);
  });

  it('matches no other spec', () => {
    for (const other of OTHERS) expect(matches(shots.testMatch, `${ROOT}/${other}`), other).toBe(false);
  });

  it('has its own Linux snapshot directory and emulates reduced motion', () => {
    expect(shots.snapshotPathTemplate).toBe('{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}');
    expect(shots.use?.reducedMotion).toBe('reduce');
  });
});

describe('the e2e project', () => {
  const e2e = project('e2e');

  it('ignores the fixtures screenshot spec, with either path separator', () => {
    expect(matches(e2e.testIgnore, FIXTURES_SPEC)).toBe(true);
    expect(matches(e2e.testIgnore, 'C:\\work\\dashboard-next\\tests\\e2e\\fixtures.spec.ts')).toBe(true);
  });

  it('still runs the other fixtures browser gates', () => {
    for (const gate of ['fixtures-route.spec.ts', 'fixtures-a11y.spec.ts', 'fixtures-keyboard.spec.ts', 'fixtures-state-manifest.spec.ts']) {
      expect(matches(e2e.testIgnore, `${ROOT}/${gate}`), gate).toBe(false);
    }
  });

  it('keeps every earlier exclusion', () => {
    for (const excluded of ['visual.spec.ts', 'x-live.spec.ts', 'gallery-parity.spec.ts', 'review.spec.ts', 'style-fingerprint.spec.ts']) {
      expect(matches(e2e.testIgnore, `${ROOT}/${excluded}`), excluded).toBe(true);
    }
  });
});

describe('the legacy visual project', () => {
  const visual = project('visual');

  it('is unchanged: it matches visual.spec.ts only, with its own template', () => {
    expect(visual.testMatch).toEqual(/visual\.spec\.ts/);
    expect(matches(visual.testMatch, FIXTURES_SPEC)).toBe(false);
    expect(visual.snapshotPathTemplate).toBe('{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}');
    expect(visual.use?.reducedMotion).toBeUndefined();
  });
});

describe('the capture set', () => {
  it('captures every section at the four widths in atlas', () => {
    expect(SHOT_WIDTHS.map((width) => width.label)).toEqual(['1440', '1024', '768', '390']);
    expect(ATLAS_SHOTS).toHaveLength(FIXTURE_SLUGS.length * 4);
  });

  it('only captures alternate sections and cells that exist', () => {
    for (const shot of ALTERNATE_SHOTS) expect(FIXTURE_SLUGS, shot.name).toContain(shot.slug);
  });

  it('produces a unique file name for every capture', () => {
    const files = expectedBaselineFiles();
    expect(new Set(files).size).toBe(files.length);
    expect(files.every((file) => file.endsWith('-fixtures-shots-linux.png'))).toBe(true);
  });
});
