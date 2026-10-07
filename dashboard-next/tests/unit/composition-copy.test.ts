/**
 * The Compare and Explore headline and sub-line templates (04-21). Every sentence is built from
 * computed values; the tests feed the real contract and manifest values and the expected text is
 * derived from them in the same test, never typed as a figure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContractSite } from '@/features/contract';
import { haversineKm } from '@/features/instrument';
import { projectionCaveat } from '@/features/charts';
import { compareHeadline, compareSubline, exploreHeadline, exploreSubline, splitRecordedAt } from '@/features/fixtures/parts/compositionCopy';
import { getExcerpt } from '@/lib/audio-manifest';

const ROOT = path.resolve(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1');
const SITES = (JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8')) as { sites: ContractSite[] }).sites;
const PROJECTION = JSON.parse(fs.readFileSync(path.join(ROOT, 'projection.json'), 'utf8')) as { cumulative_explained_variance_ratio: number };

const H1 = getExcerpt('ind_H1_20220830_120000');
const D1 = getExcerpt('ind_D1_20220830_120000');

describe('compareHeadline', () => {
  it('names both statuses and prints the distance to one decimal', () => {
    expect(compareHeadline('healthy', 'degraded', 0.8123)).toBe('Reference labels: healthy and degraded, 0.8 km apart.');
    expect(compareHeadline('degraded', 'restored_early', 12)).toBe('Reference labels: degraded and restored (early), 12.0 km apart.');
  });

  it('computes the real ind_H1 and ind_D1 distance from the contract coordinates', () => {
    const a = SITES.find((site) => site.site_id === 'ind_H1');
    const b = SITES.find((site) => site.site_id === 'ind_D1');
    expect(a && b).toBeTruthy();
    const km = haversineKm({ lat: a!.latitude, lon: a!.longitude }, { lat: b!.latitude, lon: b!.longitude });
    expect(compareHeadline(a!.status, b!.status, km)).toBe(`Reference labels: healthy and degraded, ${km.toFixed(1)} km apart.`);
    expect(km).toBeGreaterThan(0);
  });
});

describe('compareSubline', () => {
  it('says "Both recorded" when the two recorder-clock timestamps are equal, as the real pair is', () => {
    expect(H1.recorded_at_recorder_clock).toBe(D1.recorded_at_recorder_clock);
    const { date, time } = splitRecordedAt(H1.recorded_at_recorder_clock);
    expect(compareSubline(H1.recorded_at_recorder_clock, D1.recorded_at_recorder_clock)).toBe(
      `Both recorded ${date} at ${time} on the recorder clock. One colour scale for both, so brighter means louder in either.`,
    );
  });

  it('names who assigned the two reference labels first, once when the assigner is shared', () => {
    const shared = { a: 'MARRS research team', b: 'MARRS research team' };
    expect(compareSubline('2022-08-30T12:00:00', '2022-08-30T12:00:00', shared)).toBe(
      'Labels assigned by MARRS research team. Both recorded 2022-08-30 at 12:00 on the recorder clock. One colour scale for both, so brighter means louder in either.',
    );
    expect(compareSubline('2022-08-30T12:00:00', '2022-08-30T12:00:00', { a: 'Lab A', b: 'Lab B' })).toMatch(/^Labels assigned by Lab A and Lab B\. Both recorded/);
  });

  it('dates each recording when they differ', () => {
    expect(compareSubline('2022-08-30T12:00:00', '2023-02-08T06:30:00')).toBe(
      'Recorded 2022-08-30 12:00 and 2023-02-08 06:30 on the recorder clock. One colour scale for both, so brighter means louder in either.',
    );
  });

  it('does not say "Both" when only the date matches', () => {
    expect(compareSubline('2022-08-30T12:00:00', '2022-08-30T18:00:00')).toContain('Recorded 2022-08-30 12:00 and 2022-08-30 18:00');
  });
});

describe('splitRecordedAt', () => {
  it('splits a recorder-clock timestamp into a date and an HH:MM time', () => {
    expect(splitRecordedAt('2022-08-30T12:00:00')).toEqual({ date: '2022-08-30', time: '12:00' });
  });
});

describe('exploreHeadline and exploreSubline', () => {
  it('counts the sites that have projection coordinates in the real contract', () => {
    const plotted = SITES.filter((site) => site.projection !== null).length;
    expect(exploreHeadline(plotted)).toBe(`A partial map of ${plotted} reef soundscapes.`);
    expect(plotted).toBeGreaterThan(0);
  });

  it('uses the singular for one site', () => {
    expect(exploreHeadline(1)).toBe('A partial map of 1 reef soundscape.');
  });

  it('prints the projection caveat computed from the real cumulative explained variance', () => {
    const text = exploreSubline(PROJECTION.cumulative_explained_variance_ratio);
    expect(text).toContain(projectionCaveat(PROJECTION.cumulative_explained_variance_ratio));
    expect(text).toContain(`${Math.round(PROJECTION.cumulative_explained_variance_ratio * 100)}% of the variation`);
    expect(text.startsWith('Each mark is one site, placed by the two strongest patterns in its sound embedding.')).toBe(true);
    expect(text.endsWith('Select a site to hear it.')).toBe(true);
  });
});
