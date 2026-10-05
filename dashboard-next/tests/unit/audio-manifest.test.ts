import { describe, it, expect } from 'vitest';
import { getExcerpt, demoPair, excerptCaption, attributionLine, compareLocations } from '@/lib/audio-manifest';

describe('audio-manifest accessors (01-17, D-05/D-06/D-07)', () => {
  it('getExcerpt returns the matching excerpt and throws on unknown ids', () => {
    const excerpt = getExcerpt('ind_H1_20220830_120000');
    expect(excerpt.site_id).toBe('ind_H1');
    expect(excerpt.url_path).toBe('/audio/marrs/ind_H1_20220830_120000.wav');
    expect(() => getExcerpt('not-a-real-id')).toThrow(/Unknown audio excerpt id/);
  });

  it('exposes the manifest RMS level (dBFS) on an excerpt (04-13)', () => {
    const excerpt = getExcerpt('ind_H1_20220830_120000');
    expect(typeof excerpt.rms_dbfs).toBe('number');
    expect(excerpt.rms_dbfs).toBeCloseTo(-60.93, 2);
  });

  it('demoPair returns the ind_H1 vs ind_D1 healthy_vs_degraded story pair', () => {
    const pair = demoPair();
    expect(pair.a.excerpt_id).toBe('ind_H1_20220830_120000');
    expect(pair.b.excerpt_id).toBe('ind_D1_20220830_120000');
    expect(pair.a.site_id).toBe('ind_H1');
    expect(pair.b.site_id).toBe('ind_D1');
    // Same location, same recorder-clock time of day.
    expect(pair.a.time_of_day_recorder_clock).toBe(pair.b.time_of_day_recorder_clock);
    expect(pair.a.recorded_at_recorder_clock.slice(0, 10)).toBe(pair.b.recorded_at_recorder_clock.slice(0, 10));
  });

  it('excerptCaption states site, region, recorder-clock time and MARRS label with no fabricated claims', () => {
    const caption = excerptCaption(getExcerpt('ind_H1_20220830_120000'));
    expect(caption).toContain('ind_H1');
    expect(caption).toContain('2022-08-30');
    expect(caption).toContain('recorder clock, timezone unverified');
    expect(caption).toContain('assigned by MARRS');
    expect(caption).toContain("'Healthy (H)'");
  });

  it('attributionLine returns the canonical MARRS citation with DOI and licence', () => {
    const line = attributionLine();
    expect(line).toContain('Williams & Jones 2025');
    expect(line).toContain('10.5522/04/29958062');
    expect(line).toContain('CC BY 4.0');
  });

  it('compareLocations groups excerpts by site prefix with no invented states', () => {
    const locations = compareLocations();
    const ind = locations.find((l) => l.id === 'ind');
    expect(ind).toBeDefined();
    expect(ind!.available.sort()).toEqual(['degraded', 'healthy', 'restored_early', 'restored_mid'].sort());
    for (const status of ind!.available) {
      expect(ind!.excerpts[status].site_id.startsWith('ind_')).toBe(true);
    }
  });
});
