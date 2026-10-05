/**
 * Token map style (04-20, DS-01). Pure builders: no React, no DOM and no maplibre-gl import, so the
 * module is unit-testable without WebGL. The one token source (src/styles/tokens.css) reaches a map
 * through readTokens (features/ui/tokens.ts), which returns resolved six-digit hex strings; this file
 * turns those into a tile-free MapLibre style: a `background` layer painted in the ground token and
 * one `circle` layer, one circle per site at its real coordinates, coloured by status through the
 * same hab-* tokens the CSS utilities and the Plot marks use.
 *
 * The probe has no tiles, no glyphs and no sprite, so it needs no network. It proves the wiring
 * Phase 6 builds on (a token change reaches a map with `setPaintProperty`, never `setStyle`, which
 * flashes). The live maps (ReefMap, WorldMap, MiniMap) and the legacy STATUS_COLORS are not touched.
 */
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { Tokens } from '@/features/ui/tokens';

export const PROBE_SOURCE_ID = 'probe-sites';
export const PROBE_LAYER_ID = 'probe-sites-circles';
export const PROBE_BACKGROUND_ID = 'probe-background';

/** The slice of a contract site the probe draws. */
export interface ProbeSite {
  site_id: string;
  status: string;
  latitude: number;
  longitude: number;
}

export interface ProbeFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { site_id: string; status: string };
    geometry: { type: 'Point'; coordinates: [number, number] };
  }>;
}

/** One point per site at its real coordinates (GeoJSON order: longitude, latitude). */
export function probeGeoJson(sites: readonly ProbeSite[]): ProbeFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map((site) => ({
      type: 'Feature',
      properties: { site_id: site.site_id, status: site.status },
      geometry: { type: 'Point', coordinates: [site.longitude, site.latitude] },
    })),
  };
}

/** `circle-color`: the status property mapped to its hab token; anything else is the unknown tone. */
export function statusColorExpression(tokens: Tokens): ExpressionSpecification {
  return [
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
  ] as ExpressionSpecification;
}

export function buildTokenMapStyle(tokens: Tokens, geojson: ProbeFeatureCollection): StyleSpecification {
  return {
    version: 8,
    sources: {
      [PROBE_SOURCE_ID]: { type: 'geojson', data: geojson as never },
    },
    layers: [
      { id: PROBE_BACKGROUND_ID, type: 'background', paint: { 'background-color': tokens.ground } },
      {
        id: PROBE_LAYER_ID,
        type: 'circle',
        source: PROBE_SOURCE_ID,
        paint: {
          'circle-color': statusColorExpression(tokens),
          'circle-radius': 6,
          'circle-stroke-color': tokens['mark-outline'],
          'circle-stroke-width': 1,
        },
      },
    ],
  };
}
