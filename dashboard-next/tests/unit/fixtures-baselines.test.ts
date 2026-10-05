// @vitest-environment node
/**
 * Plan 04-24 guard: the committed /dev/fixtures screenshot baselines are exactly the set the spec
 * (tests/e2e/fixtures.spec.ts) captures, no more and no fewer.
 *
 * The expected names come from tests/e2e/support/fixture-shots.ts, the same module the spec reads,
 * so the two cannot disagree. The test looks at file NAMES only: the baselines are stored in Git
 * LFS, and a checkout without `git lfs pull` holds small pointer files under the same names, which
 * must not break this test. Their pixels are compared by the CI visual job, not here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';
import {
  ALTERNATE_SHOTS,
  ATLAS_SHOTS,
  SHOT_WIDTHS,
  SNAPSHOT_SUFFIX,
  expectedBaselineFiles,
} from '../e2e/support/fixture-shots';

const SNAPSHOT_DIR = path.join(__dirname, '..', 'e2e', 'fixtures.spec.ts-snapshots');

function committedFiles(): string[] {
  return fs.readdirSync(SNAPSHOT_DIR).sort();
}

describe('fixtures screenshot baselines', () => {
  const expected = expectedBaselineFiles();

  it('expects every atlas section at every width plus the alternate set', () => {
    expect(ATLAS_SHOTS).toHaveLength(FIXTURE_SLUGS.length * SHOT_WIDTHS.length);
    expect(expected).toHaveLength(ATLAS_SHOTS.length + ALTERNATE_SHOTS.length);
    expect(new Set(expected).size).toBe(expected.length);
    for (const name of expected) expect(name.endsWith(SNAPSHOT_SUFFIX)).toBe(true);
  });

  it('holds exactly the expected baseline files', () => {
    const present = committedFiles();
    const missing = expected.filter((name) => !present.includes(name));
    const unexpected = present.filter((name) => !expected.includes(name));
    expect({ missing, unexpected }).toEqual({ missing: [], unexpected: [] });
    expect(present).toEqual([...expected].sort());
  });

  it('holds nothing but .png baselines', () => {
    for (const name of committedFiles()) expect(name.endsWith('.png')).toBe(true);
  });
});
