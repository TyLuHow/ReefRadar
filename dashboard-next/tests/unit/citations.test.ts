import { describe, it, expect } from 'vitest';
import { CITATIONS, getCitation, formatCitation } from '@/lib/citations';

// D-19/TRUTH-08: unit tests for the canonical citations module.

describe('CITATIONS', () => {
  it('has every record with id, title, authors, year, licence and a doi or url', () => {
    const ids = Object.keys(CITATIONS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const record = CITATIONS[id];
      expect(record.id).toBeTruthy();
      expect(record.title).toBeTruthy();
      expect(Array.isArray(record.authors)).toBe(true);
      expect(record.authors.length).toBeGreaterThan(0);
      expect('year' in record).toBe(true);
      expect(record.licence).toBeTruthy();
      expect(record.doi || record.url).toBeTruthy();
    }
  });
});

describe('getCitation', () => {
  it('returns the record for a known id', () => {
    expect(getCitation('marrs').id).toBe('marrs');
  });

  it('throws for an unknown id', () => {
    expect(() => getCitation('unknown')).toThrow();
  });
});

describe('formatCitation', () => {
  it('formats marrs short citation with Williams and 2025', () => {
    const short = formatCitation('marrs', 'short');
    expect(short).toContain('Williams');
    expect(short).toContain('2025');
  });

  it('formats surfperch apa citation with the correct arXiv id', () => {
    const apa = formatCitation('surfperch', 'apa');
    expect(apa).toContain('2404.16436');
  });

  it('formats a bibtex entry for marrs', () => {
    const bibtex = formatCitation('marrs', 'bibtex');
    expect(bibtex).toContain('@misc{');
    expect(bibtex).toContain('williams2025');
  });
});
