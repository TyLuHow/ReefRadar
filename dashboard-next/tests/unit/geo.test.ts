/**
 * haversineKm (04-21): the great-circle distance the Compare composition prints in its headline.
 */
import { describe, expect, it } from 'vitest';
import { haversineKm } from '@/features/instrument';

describe('haversineKm', () => {
  it('is 0 between identical points', () => {
    expect(haversineKm({ lat: -4.9216, lon: 119.316922 }, { lat: -4.9216, lon: 119.316922 })).toBe(0);
  });

  it('is about 111.19 km for one degree of longitude on the equator', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  });

  it('is symmetric', () => {
    const a = { lat: -4.9216, lon: 119.316922 };
    const b = { lat: -4.928784, lon: 119.316541 };
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });

  it('measures the real ind_H1 to ind_D1 pair as under a kilometre', () => {
    const km = haversineKm({ lat: -4.9216, lon: 119.316922 }, { lat: -4.928784, lon: 119.316541 });
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(1.5);
  });

  it('handles points on either side of the antimeridian', () => {
    expect(haversineKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo(111.19, 1);
  });

  it('is half the circumference between antipodes', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371.0088, 3);
  });
});
