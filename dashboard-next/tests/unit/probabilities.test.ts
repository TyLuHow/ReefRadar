import { describe, it, expect } from 'vitest';
import { toIntegerPercentages, presentClasses } from '@/lib/probabilities';

describe('toIntegerPercentages', () => {
  it('returns integers that sum to exactly 100 for a near-even split', () => {
    const result = toIntegerPercentages({
      degraded: 0.333,
      healthy: 0.333,
      restored_early: 0.334,
    });
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    for (const v of Object.values(result)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('rounds a clean 60/30/10 split exactly', () => {
    const result = toIntegerPercentages({ a: 0.6, b: 0.3, c: 0.1 });
    expect(result).toEqual({ a: 60, b: 30, c: 10 });
  });

  it('renormalises a legacy multiplied input (sum 0.7) to the same percentages', () => {
    const result = toIntegerPercentages({ a: 0.42, b: 0.21, c: 0.07 });
    expect(result).toEqual({ a: 60, b: 30, c: 10 });
  });

  it('breaks remainder ties by key order', () => {
    // Each of 3 equal entries: normalized = 33.333..., floors sum to 99,
    // remainder 1 must go to the first key by insertion order.
    const result = toIntegerPercentages({ x: 1, y: 1, z: 1 });
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(result.x).toBe(34);
    expect(result.y).toBe(33);
    expect(result.z).toBe(33);
  });

  it('returns {} for an empty input', () => {
    expect(toIntegerPercentages({})).toEqual({});
  });

  it('returns all zeros for an all-zero input without dividing by zero', () => {
    const result = toIntegerPercentages({ a: 0, b: 0, c: 0 });
    expect(result).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe('presentClasses', () => {
  const order = ['healthy', 'degraded', 'restored_early', 'restored_mid'] as const;

  it('returns the canonical order filtered to keys present in the response', () => {
    const result = presentClasses(
      { degraded: 0.27, healthy: 0.58, restored_early: 0.15 },
      order
    );
    expect(result).toEqual(['healthy', 'degraded', 'restored_early']);
  });

  it('omits a class absent from the response (3-class model)', () => {
    const result = presentClasses(
      { degraded: 0.27, healthy: 0.58, restored_early: 0.15 },
      order
    );
    expect(result).not.toContain('restored_mid');
  });

  it('returns an empty array for null/undefined input', () => {
    expect(presentClasses(undefined, order)).toEqual([]);
    expect(presentClasses(null, order)).toEqual([]);
  });
});
