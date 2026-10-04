import { describe, expect, it } from 'vitest';
import { DIRECTIONS, parseFixtureQuery } from '@/features/fixtures/query';

function parse(query: string) {
  return parseFixtureQuery(new URLSearchParams(query));
}

describe('parseFixtureQuery direction', () => {
  it('lists the three directions', () => {
    expect([...DIRECTIONS]).toEqual(['atlas', 'nocturne', 'poster']);
  });

  it.each(DIRECTIONS)('accepts %s', (direction) => {
    expect(parse(`direction=${direction}`).direction).toBe(direction);
  });

  it('falls back to atlas for unknown or missing values', () => {
    expect(parse('direction=evil').direction).toBe('atlas');
    expect(parse('direction=').direction).toBe('atlas');
    expect(parse('direction=ATLAS').direction).toBe('atlas');
    expect(parse('').direction).toBe('atlas');
  });
});

describe('parseFixtureQuery reduced', () => {
  it('is true only for 1', () => {
    expect(parse('reduced=1').reduced).toBe(true);
  });

  it('is false for any other value or no param', () => {
    for (const value of ['0', 'true', 'yes', '', '11', ' 1']) {
      expect(parse(`reduced=${encodeURIComponent(value)}`).reduced).toBe(false);
    }
    expect(parse('').reduced).toBe(false);
  });
});

describe('parseFixtureQuery token overrides', () => {
  it('accepts a --dir- name with a six-digit hex value', () => {
    expect(parse('tok=--dir-hab-healthy:%23B00020').tokenOverrides).toEqual([['--dir-hab-healthy', '#B00020']]);
    expect(parse('tok=--dir-ground:%23abcdef').tokenOverrides).toEqual([['--dir-ground', '#abcdef']]);
  });

  it('ignores any other name or value', () => {
    for (const bad of [
      '--dir-x:red',
      'background:url(x)',
      '--dir-a:%23B00020;color:red',
      '--color-hab-healthy:%23B00020',
      '--dir-:%23B00020',
      '--dir-UP:%23B00020',
      '--dir-a:%23B0002',
      '--dir-a:%23B000200',
      '--dir-a:B00020',
      '--dir-a:%23B00020%20',
      '--dir-a',
      ':%23B00020',
      '--dir-a:%23B00020:%23B00020',
    ]) {
      expect(parse(`tok=${bad}`).tokenOverrides, bad).toEqual([]);
    }
  });

  it('keeps the valid entries when invalid ones are mixed in', () => {
    const result = parse('tok=--dir-x:red&tok=--dir-accent:%23112233&tok=bad');
    expect(result.tokenOverrides).toEqual([['--dir-accent', '#112233']]);
  });

  it('keeps at most 8 overrides', () => {
    const query = Array.from({ length: 12 }, (_, index) => `tok=--dir-t${index}:%23${String(index).padStart(6, '0')}`).join('&');
    const overrides = parse(query).tokenOverrides;
    expect(overrides).toHaveLength(8);
    expect(overrides[0]).toEqual(['--dir-t0', '#000000']);
    expect(overrides[7]).toEqual(['--dir-t7', '#000007']);
  });
});
