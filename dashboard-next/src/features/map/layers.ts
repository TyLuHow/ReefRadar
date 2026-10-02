/**
 * Pure helpers for the monitoring-network map (ReefMap): a GeoJSON builder and
 * the four circle layer specs. No React and no maplibre-gl import here, so the
 * module is unit-testable under jsdom (which has no WebGL).
 *
 * Encoding is today's deck.gl encoding mapped onto MapLibre paint properties
 * (UI-SPEC "Map Parity Contract", ReefMap circle encoding):
 *
 *   group                      layer                         alpha          radius px (z low -> z high)
 *   has_embedding !== false    sites-halo                    80/255         12 -> 40   not interactive
 *   has_embedding !== false    sites-core                    230/255        6  -> 24   interactive
 *   has_embedding === false    sites-no-embedding-halo       40/255         8  -> 28   not interactive
 *   has_embedding === false    sites-no-embedding-core       120/255        4  -> 16   interactive,
 *                                                            same-colour stroke 0.70, 1 -> 3 px
 *
 * Colours come from STATUS_COLORS in src/types (no second colour table).
 * Coordinates are GeoJSON order: [longitude, latitude].
 */
import { STATUS_COLORS, type ReefStatus, type Site } from '@/types';

export const SITES_SOURCE_ID = 'sites';

export const SITE_LAYER_IDS = {
  halo: 'sites-halo',
  core: 'sites-core',
  noEmbeddingHalo: 'sites-no-embedding-halo',
  noEmbeddingCore: 'sites-no-embedding-core',
} as const;

/** Layers that respond to hover and click (the two cores). */
export const INTERACTIVE_LAYER_IDS: string[] = [
  SITE_LAYER_IDS.core,
  SITE_LAYER_IDS.noEmbeddingCore,
];

/** Same fallback colour today's deck.gl map used for a status outside STATUS_COLORS. */
export const FALLBACK_COLOR = '#888888';

// Fill alphas: today's deck.gl byte alphas divided by 255.
export const HALO_ALPHA = 80 / 255;
export const CORE_ALPHA = 230 / 255;
export const NO_EMBEDDING_HALO_ALPHA = 40 / 255;
export const NO_EMBEDDING_CORE_ALPHA = 120 / 255;
/** Same-colour stroke on the location-only core (deck.gl 180/255, UI-SPEC 0.70). */
export const NO_EMBEDDING_STROKE_ALPHA = 0.7;

/** Extra core radius for the hovered or selected site (feature-state). */
export const HIGHLIGHT_EXTRA_PX = 2;

export interface SiteFeatureProperties {
  site_id: string;
  status: ReefStatus;
  color: string;
  has_embedding: boolean;
}

export interface SitePointFeature {
  type: 'Feature';
  properties: SiteFeatureProperties;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export interface SitesFeatureCollection {
  type: 'FeatureCollection';
  features: SitePointFeature[];
}

export function statusColor(status: ReefStatus): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLOR;
}

function hasCoordinates(site: Site): site is Site & { latitude: number; longitude: number } {
  return (
    typeof site.latitude === 'number' &&
    Number.isFinite(site.latitude) &&
    typeof site.longitude === 'number' &&
    Number.isFinite(site.longitude)
  );
}

/** Sites without coordinates are skipped; has_embedding defaults to true (only an explicit false is location-only). */
export function buildSitesGeoJson(sites: Site[]): SitesFeatureCollection {
  const features: SitePointFeature[] = [];
  for (const site of sites) {
    if (!hasCoordinates(site)) continue;
    features.push({
      type: 'Feature',
      properties: {
        site_id: site.site_id,
        status: site.status,
        color: statusColor(site.status),
        has_embedding: site.has_embedding !== false,
      },
      // GeoJSON order is [longitude, latitude]; Leaflet/deck-style [lat, lon] would land in Antarctica.
      geometry: { type: 'Point', coordinates: [site.longitude, site.latitude] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Counts for the "Full data (n)" / "Location only (n)" legend (sites with coordinates only). */
export function countSites(sites: Site[]): { fullData: number; locationOnly: number } {
  let fullData = 0;
  let locationOnly = 0;
  for (const site of sites) {
    if (!hasCoordinates(site)) continue;
    if (site.has_embedding === false) locationOnly += 1;
    else fullData += 1;
  }
  return { fullData, locationOnly };
}

// --- Paint expressions -------------------------------------------------------

type Expression = unknown[];

/** A MapLibre circle layer without its source (the Source component supplies it). Spread into <Layer>. */
export interface CircleLayerDef {
  id: string;
  type: 'circle';
  filter: Expression;
  paint: Record<string, unknown>;
}

/** Zoom-interpolated radius. */
function zoomRadius(zLow: number, low: number, zHigh: number, high: number): Expression {
  return ['interpolate', ['linear'], ['zoom'], zLow, low, zHigh, high];
}

/**
 * Core radius with the +2px hover/selected feedback. MapLibre allows `zoom` only as the
 * input of a top-level interpolate, so the feature-state term sits inside each stop output.
 */
function coreRadius(zLow: number, low: number, zHigh: number, high: number): Expression {
  const extra: Expression = [
    'case',
    [
      'any',
      ['boolean', ['feature-state', 'hover'], false],
      ['boolean', ['feature-state', 'selected'], false],
    ],
    HIGHLIGHT_EXTRA_PX,
    0,
  ];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    zLow,
    ['+', low, extra],
    zHigh,
    ['+', high, extra],
  ];
}

const FULL_DATA_FILTER: Expression = ['==', ['get', 'has_embedding'], true];
const LOCATION_ONLY_FILTER: Expression = ['==', ['get', 'has_embedding'], false];
const COLOR: Expression = ['get', 'color'];

export const haloLayer: CircleLayerDef = {
  id: SITE_LAYER_IDS.halo,
  type: 'circle',
  filter: FULL_DATA_FILTER,
  paint: {
    'circle-color': COLOR,
    'circle-opacity': HALO_ALPHA,
    'circle-radius': zoomRadius(10, 12, 11.5, 40),
  },
};

export const coreLayer: CircleLayerDef = {
  id: SITE_LAYER_IDS.core,
  type: 'circle',
  filter: FULL_DATA_FILTER,
  paint: {
    'circle-color': COLOR,
    'circle-opacity': CORE_ALPHA,
    'circle-radius': coreRadius(10, 6, 12.5, 24),
  },
};

export const noEmbeddingHaloLayer: CircleLayerDef = {
  id: SITE_LAYER_IDS.noEmbeddingHalo,
  type: 'circle',
  filter: LOCATION_ONLY_FILTER,
  paint: {
    'circle-color': COLOR,
    'circle-opacity': NO_EMBEDDING_HALO_ALPHA,
    'circle-radius': zoomRadius(10, 8, 11.5, 28),
  },
};

export const noEmbeddingCoreLayer: CircleLayerDef = {
  id: SITE_LAYER_IDS.noEmbeddingCore,
  type: 'circle',
  filter: LOCATION_ONLY_FILTER,
  paint: {
    'circle-color': COLOR,
    'circle-opacity': NO_EMBEDDING_CORE_ALPHA,
    'circle-radius': coreRadius(10, 4, 12.5, 16),
    'circle-stroke-color': COLOR,
    'circle-stroke-opacity': NO_EMBEDDING_STROKE_ALPHA,
    'circle-stroke-width': zoomRadius(10, 1, 12.5, 3),
  },
};

/** Draw order matches today's map: halos under cores, full-data group first. */
export const SITE_LAYERS: CircleLayerDef[] = [
  haloLayer,
  coreLayer,
  noEmbeddingHaloLayer,
  noEmbeddingCoreLayer,
];
