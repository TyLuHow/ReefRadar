/**
 * MapLibre 6 setup (client only).
 *
 * maplibre-gl 6 is ESM-only and loads its web worker from a URL. Under Next/Turbopack
 * the worker and its sibling shared chunk are not emitted by the bundler, so
 * scripts/copy-maplibre-worker.mjs copies both from node_modules into public/maplibre/
 * on predev and prebuild, and the worker URL is set once here.
 *
 * Import this module only from client components that are themselves loaded with
 * next/dynamic ssr:false (the map pages do this).
 */
import * as maplibregl from 'maplibre-gl';

export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
}

/** Pass as the `mapLib` prop of react-map-gl's Map so it uses this exact instance. */
export const mapLib = Promise.resolve(maplibregl);
