import { describe, it, expect } from 'vitest';
import { STATUS_COLORS, type ReefStatus, type Site } from '@/types';
import {
  FALLBACK_COLOR,
  HIGHLIGHT_EXTRA_PX,
  INTERACTIVE_LAYER_IDS,
  SITE_LAYERS,
  SITE_LAYER_IDS,
  buildSitesGeoJson,
  countSites,
  statusColor,
  coreLayer,
  haloLayer,
  noEmbeddingCoreLayer,
  noEmbeddingHaloLayer,
} from '@/features/map/layers';

// Plain-data checks only: jsdom has no WebGL, and the real maplibre-gl is never imported here.

const INDONESIA: Site = {
  site_id: 'idn_test',
  country: 'Indonesia',
  status: 'healthy',
  latitude: -5.1,
  longitude: 119.2,
};

describe('buildSitesGeoJson', () => {
  it('writes coordinates as [longitude, latitude] (not swapped)', () => {
    const fc = buildSitesGeoJson([INDONESIA]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    const [lon, lat] = fc.features[0].geometry.coordinates;
    expect(lon).toBeCloseTo(119.2, 5);
    expect(lat).toBeCloseTo(-5.1, 5);
    // A swapped pair would put the point in Antarctica (|lat| > 90 would even be invalid).
    expect(lat).toBeLessThan(10);
    expect(lon).toBeGreaterThan(100);
  });

  it('skips sites without coordinates', () => {
    const fc = buildSitesGeoJson([
      INDONESIA,
      { site_id: 'no_coords', country: 'Kenya', status: 'degraded' },
      { site_id: 'half', country: 'Kenya', status: 'degraded', latitude: -3 },
    ]);
    expect(fc.features.map((f) => f.properties.site_id)).toEqual(['idn_test']);
  });

  it.each(Object.keys(STATUS_COLORS) as ReefStatus[])('colours %s from STATUS_COLORS', (status) => {
    const fc = buildSitesGeoJson([{ ...INDONESIA, status }]);
    expect(fc.features[0].properties.color).toBe(STATUS_COLORS[status]);
    expect(statusColor(status)).toBe(STATUS_COLORS[status]);
  });

  it('falls back to the same grey as before for a status outside STATUS_COLORS', () => {
    const fc = buildSitesGeoJson([{ ...INDONESIA, status: 'mystery' as ReefStatus }]);
    expect(fc.features[0].properties.color).toBe(FALLBACK_COLOR);
    expect(FALLBACK_COLOR).toBe('#888888');
  });

  it('only an explicit has_embedding === false is location-only', () => {
    const fc = buildSitesGeoJson([
      { ...INDONESIA, site_id: 'a' },
      { ...INDONESIA, site_id: 'b', has_embedding: true },
      { ...INDONESIA, site_id: 'c', has_embedding: false },
    ]);
    expect(fc.features.map((f) => f.properties.has_embedding)).toEqual([true, true, false]);
  });
});

describe('countSites', () => {
  it('splits full-data and location-only sites that have coordinates', () => {
    expect(
      countSites([
        { ...INDONESIA, site_id: 'a' },
        { ...INDONESIA, site_id: 'b', has_embedding: false },
        { ...INDONESIA, site_id: 'c', has_embedding: false },
        { site_id: 'd', country: 'Kenya', status: 'healthy' },
      ]),
    ).toEqual({ fullData: 1, locationOnly: 2 });
  });

  it('is zero and zero with no sites', () => {
    expect(countSites([])).toEqual({ fullData: 0, locationOnly: 0 });
  });
});

describe('circle layers', () => {
  it('defines four layers in draw order with the expected ids', () => {
    expect(SITE_LAYERS.map((l) => l.id)).toEqual([
      SITE_LAYER_IDS.halo,
      SITE_LAYER_IDS.core,
      SITE_LAYER_IDS.noEmbeddingHalo,
      SITE_LAYER_IDS.noEmbeddingCore,
    ]);
    expect(SITE_LAYERS.every((l) => l.type === 'circle')).toBe(true);
  });

  it('only the two cores are interactive', () => {
    expect(INTERACTIVE_LAYER_IDS).toEqual([SITE_LAYER_IDS.core, SITE_LAYER_IDS.noEmbeddingCore]);
  });

  it('fill alphas equal deck.gl 80, 230, 40 and 120 over 255', () => {
    expect(haloLayer.paint['circle-opacity'] as number).toBeCloseTo(80 / 255, 2);
    expect(coreLayer.paint['circle-opacity'] as number).toBeCloseTo(230 / 255, 2);
    expect(noEmbeddingHaloLayer.paint['circle-opacity'] as number).toBeCloseTo(40 / 255, 2);
    expect(noEmbeddingCoreLayer.paint['circle-opacity'] as number).toBeCloseTo(120 / 255, 2);
  });

  it('every layer takes its colour from the feature colour property', () => {
    for (const layer of SITE_LAYERS) {
      expect(layer.paint['circle-color']).toEqual(['get', 'color']);
    }
  });

  it('full-data layers filter has_embedding true, location-only layers false', () => {
    expect(haloLayer.filter).toEqual(['==', ['get', 'has_embedding'], true]);
    expect(coreLayer.filter).toEqual(['==', ['get', 'has_embedding'], true]);
    expect(noEmbeddingHaloLayer.filter).toEqual(['==', ['get', 'has_embedding'], false]);
    expect(noEmbeddingCoreLayer.filter).toEqual(['==', ['get', 'has_embedding'], false]);
  });

  it('the location-only core has a same-colour stroke at alpha 0.70', () => {
    expect(noEmbeddingCoreLayer.paint['circle-stroke-color']).toEqual(['get', 'color']);
    expect(noEmbeddingCoreLayer.paint['circle-stroke-opacity']).toBeCloseTo(0.7, 2);
    expect(coreLayer.paint['circle-stroke-width']).toBeUndefined();
  });

  it('core radii carry the +2px hover/selected feature-state term; halos do not', () => {
    expect(HIGHLIGHT_EXTRA_PX).toBe(2);
    for (const core of [coreLayer, noEmbeddingCoreLayer]) {
      const json = JSON.stringify(core.paint['circle-radius']);
      expect(json).toContain('"feature-state","hover"');
      expect(json).toContain('"feature-state","selected"');
      expect(json).toContain('"zoom"');
      expect(json).toContain(`,${HIGHLIGHT_EXTRA_PX},0]`);
    }
    for (const halo of [haloLayer, noEmbeddingHaloLayer]) {
      expect(JSON.stringify(halo.paint['circle-radius'])).not.toContain('feature-state');
    }
  });

  it('zoom is only the input of a top-level interpolate (MapLibre expression rule)', () => {
    for (const layer of SITE_LAYERS) {
      const radius = layer.paint['circle-radius'] as unknown[];
      expect(radius.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
      // Stop outputs (every second element after the input) never contain a nested zoom.
      const outputs = radius.slice(3).filter((_, i) => i % 2 === 1);
      for (const out of outputs) expect(JSON.stringify(out)).not.toContain('"zoom"');
    }
  });

  it('radius stops reproduce the UI-SPEC encoding table', () => {
    const base = (v: unknown) => (Array.isArray(v) ? v[1] : v);
    const check = (l: { paint: Record<string, unknown> }, low: number, high: number) => {
      const r = l.paint['circle-radius'] as unknown[];
      expect(base(r[4])).toBe(low);
      expect(base(r[6])).toBe(high);
    };
    check(haloLayer, 12, 40);
    check(coreLayer, 6, 24);
    check(noEmbeddingHaloLayer, 8, 28);
    check(noEmbeddingCoreLayer, 4, 16);
  });
});
