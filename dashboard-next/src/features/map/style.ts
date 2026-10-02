import type { StyleSpecification } from 'maplibre-gl';

/**
 * OpenStreetMap raster base layer for the light maps (WorldMap, later MiniMap).
 *
 * OSM tile usage policy: the standard tile URL only (no subdomains, no rewriting), tiles
 * are requested by the map as it is panned and zoomed (no prefetch, no scripted loading),
 * and the attribution is always visible as text (see AttributionControl compact={false}).
 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** WorldMap attribution (constant HTML, never built from data). */
export const WORLD_MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** MiniMap attribution: the shorter form used today. */
export const MINI_MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function osmRasterStyle(attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [OSM_TILE_URL],
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

export const WORLD_MAP_STYLE: StyleSpecification = osmRasterStyle(WORLD_MAP_ATTRIBUTION);

export const MINI_MAP_STYLE: StyleSpecification = osmRasterStyle(MINI_MAP_ATTRIBUTION);
