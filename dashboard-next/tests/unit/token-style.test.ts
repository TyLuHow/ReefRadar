// @vitest-environment node
/**
 * Token map style (04-20, DS-01): the pure builders that turn the resolved tokens into a tile-free
 * MapLibre style. No DOM and no maplibre-gl here, so it runs without WebGL. The wiring that proves
 * a changed token reaches a live map is the token-bridge e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  PROBE_BACKGROUND_ID,
  PROBE_LAYER_ID,
  PROBE_SOURCE_ID,
  buildTokenMapStyle,
  probeGeoJson,
  statusColorExpression,
} from '@/features/map';
import { JS_TOKEN_KEYS, type Tokens } from '@/features/ui/tokens';

/** Distinct, valid six-digit hexes so a mix-up between two tokens cannot pass. */
function tokensFixture(): Tokens {
  const tokens = {} as Tokens;
  JS_TOKEN_KEYS.forEach((key, index) => {
    tokens[key] = `#${(0x101010 + index * 0x0a0b0c).toString(16).padStart(6, '0')}`;
  });
  return tokens;
}

const SITES = [
  { site_id: 'ind_H1', status: 'healthy', latitude: -4.8, longitude: 119.3 },
  { site_id: 'aus_D1', status: 'degraded', latitude: -18.3, longitude: 147.7 },
] as const;

describe('statusColorExpression', () => {
  it('matches each status to its hab token and falls back to the unknown tone', () => {
    const tokens = tokensFixture();
    expect(statusColorExpression(tokens)).toEqual([
      'match',
      ['get', 'status'],
      'degraded',
      tokens['hab-degraded'],
      'restored_early',
      tokens['hab-restored-early'],
      'restored_mid',
      tokens['hab-restored-mid'],
      'healthy',
      tokens['hab-healthy'],
      tokens['hab-unknown'],
    ]);
  });

  it('carries the tokens it was given, never a stored colour', () => {
    const a = tokensFixture();
    const b = { ...a, 'hab-healthy': '#B00020' };
    expect(JSON.stringify(statusColorExpression(b))).toContain('#B00020');
    expect(JSON.stringify(statusColorExpression(a))).not.toContain('#B00020');
  });
});

describe('probeGeoJson', () => {
  it('has one point per site at its real coordinates, longitude first, with its status', () => {
    const collection = probeGeoJson([...SITES]);
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toEqual([
      { type: 'Feature', properties: { site_id: 'ind_H1', status: 'healthy' }, geometry: { type: 'Point', coordinates: [119.3, -4.8] } },
      { type: 'Feature', properties: { site_id: 'aus_D1', status: 'degraded' }, geometry: { type: 'Point', coordinates: [147.7, -18.3] } },
    ]);
  });
});

describe('buildTokenMapStyle', () => {
  const tokens = tokensFixture();
  const geojson = probeGeoJson([...SITES]);
  const style = buildTokenMapStyle(tokens, geojson);

  it('is a version 8 style with no glyphs, no sprite and no tile source', () => {
    expect(style.version).toBe(8);
    expect(style).not.toHaveProperty('glyphs');
    expect(style).not.toHaveProperty('sprite');
    expect(Object.values(style.sources).map((source) => source.type)).toEqual(['geojson']);
    // Nothing in the style names a URL: it needs no network.
    expect(JSON.stringify(style)).not.toMatch(/https?:/);
  });

  it('paints a background layer in the ground token', () => {
    expect(style.layers[0]).toEqual({ id: PROBE_BACKGROUND_ID, type: 'background', paint: { 'background-color': tokens.ground } });
    expect(PROBE_BACKGROUND_ID).toBe('probe-background');
  });

  it('has one geojson source and one circle layer coloured by status with the ink outline', () => {
    expect(PROBE_SOURCE_ID).toBe('probe-sites');
    expect(PROBE_LAYER_ID).toBe('probe-sites-circles');
    expect(style.sources[PROBE_SOURCE_ID]).toEqual({ type: 'geojson', data: geojson });
    const circle = style.layers.find((layer) => layer.id === PROBE_LAYER_ID);
    expect(circle).toEqual({
      id: PROBE_LAYER_ID,
      type: 'circle',
      source: PROBE_SOURCE_ID,
      paint: {
        'circle-color': statusColorExpression(tokens),
        'circle-radius': 6,
        'circle-stroke-color': tokens['mark-outline'],
        'circle-stroke-width': 1,
      },
    });
  });
});
