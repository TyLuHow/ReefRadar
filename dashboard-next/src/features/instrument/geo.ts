/**
 * Great-circle distance (04-21). The Compare composition prints "{km} km apart" in its headline, so
 * the figure is computed from the two sites' own coordinates and never typed.
 */

/** Mean Earth radius in kilometres (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Haversine distance in kilometres between two points given in decimal degrees. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  // Clamp: rounding can push h a hair past 1 for antipodes, and asin would return NaN.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
