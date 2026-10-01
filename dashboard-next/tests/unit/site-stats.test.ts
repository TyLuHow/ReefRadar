import { describe, it, expect } from 'vitest';
import { deriveSiteStats, formatList } from '@/lib/site-stats';
import type { SitesResponse } from '@/types';
import sitesFixture from '../fixtures/api/sites.json';

// D-18/TRUTH-07: every site/country/category count derived from /sites, not
// hard-coded.

const fixture = sitesFixture as unknown as SitesResponse;

describe('deriveSiteStats', () => {
  it('derives total, countries, acoustic reference count, byStatus and labelCategories from the fixture', () => {
    const stats = deriveSiteStats(fixture);

    expect(stats.total).toBe(54);

    expect(stats.countries).toEqual(
      ['Australia', 'French Polynesia', 'Indonesia', 'Kenya', 'Maldives', 'Mexico', 'USA'].sort()
    );
    expect(stats.countryCount).toBe(7);

    // has_embedding === true count, independent of any stale top-level field.
    expect(stats.acousticReference).toBe(
      fixture.sites.filter((s) => s.has_embedding === true).length
    );

    const total = Object.values(stats.byStatus).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(54);
    expect(stats.byStatus.unknown).toBeGreaterThan(0);

    // Distinct non-unknown statuses actually present.
    expect(stats.labelCategories).not.toContain('unknown');
    expect(stats.labelCategories.sort()).toEqual(
      ['degraded', 'healthy', 'restored_early', 'restored_mid'].sort()
    );
    expect(stats.labelCategoryCount).toBe(4);

    expect(stats.datasetNames).toContain('MARRS (Mars Assisted Reef Restoration System)');
    expect(stats.datasetNames).toContain('CoralSoundExplorer');
    expect(stats.datasetNames).toContain('Hurricane Irma Dataset');
    expect(stats.datasetNames).toContain('NOAA SanctSound');
  });

  it('returns all-zero stats for an empty or missing response, without crashing', () => {
    expect(deriveSiteStats(undefined)).toMatchObject({ total: 0, countries: [], acousticReference: 0 });
    expect(deriveSiteStats({ sites: [], count: 0 })).toMatchObject({ total: 0, countries: [] });
  });
});

describe('formatList', () => {
  it('formats 0, 1, 2 and 3+ item lists with a human-readable conjunction', () => {
    expect(formatList([])).toBe('');
    expect(formatList(['A'])).toBe('A');
    expect(formatList(['A', 'B'])).toBe('A and B');
    expect(formatList(['A', 'B', 'C'])).toBe('A, B, and C');
  });
});
