'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTokens } from '@/features/ui/tokens';
import { mapLib } from './setup';
import { MapShell } from './MapShell';
import {
  PROBE_BACKGROUND_ID,
  PROBE_LAYER_ID,
  PROBE_SOURCE_ID,
  buildTokenMapStyle,
  probeGeoJson,
  statusColorExpression,
  type ProbeSite,
} from './token-style';

/**
 * The token wiring probe's map (04-20, DS-01 success criterion 1). A tile-free map: a background
 * layer painted in the ground token and one circle per site at its real coordinates, coloured from
 * the resolved hab-* tokens. The style is built once, from the first token read. After that every
 * token change (a direction switch, a `?tok=` override, an inline `style.setProperty`) re-reads the
 * tokens through useTokens and is applied with `setPaintProperty`: never `setStyle`, which flashes.
 *
 * The map is not interactive (no pan, zoom or focusable canvas); the swatches and the table beside
 * it carry the same information. `window.__tokenProbeMap` is set for Playwright only when the build
 * ran with NEXT_PUBLIC_E2E_HOOKS=1 (never on Vercel).
 *
 * Import this module only from a client component loaded with next/dynamic ssr:false.
 */

export interface TokenProbeMapProps {
  sites: readonly ProbeSite[];
  height?: number;
}

const VIEW = { longitude: 40, latitude: 5, zoom: 0.4 } as const;

export function TokenProbeMap({ sites, height = 320 }: TokenProbeMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef | null>(null);
  const { tokens } = useTokens(wrapperRef);
  const [loaded, setLoaded] = useState(false);
  const geojson = useMemo(() => probeGeoJson(sites), [sites]);

  // Built once, from the first successful token read; later changes go through setPaintProperty.
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);
  if (mapStyle === null && tokens !== null) setMapStyle(buildTokenMapStyle(tokens, geojson));

  const handleLoad = useCallback((event: { target: unknown }) => {
    // Test-only hook (T-04-20-01): set only by the Playwright webServer env, never on Vercel.
    if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') {
      (window as unknown as { __tokenProbeMap?: unknown }).__tokenProbeMap = event.target;
    }
    setLoaded(true);
  }, []);

  useEffect(
    () => () => {
      delete (window as unknown as { __tokenProbeMap?: unknown }).__tokenProbeMap;
    },
    [],
  );

  // Token change -> paint. readTokens has already checked every value is a six-digit hex (T-04-20-02).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!loaded || !map || tokens === null || !map.getLayer(PROBE_LAYER_ID)) return;
    map.setPaintProperty(PROBE_LAYER_ID, 'circle-color', statusColorExpression(tokens));
    map.setPaintProperty(PROBE_LAYER_ID, 'circle-stroke-color', tokens['mark-outline']);
    map.setPaintProperty(PROBE_BACKGROUND_ID, 'background-color', tokens.ground);
  }, [loaded, tokens]);

  // New sites -> new data on the same source.
  useEffect(() => {
    const source = mapRef.current?.getMap().getSource(PROBE_SOURCE_ID) as { setData?: (data: unknown) => void } | undefined;
    if (loaded) source?.setData?.(geojson);
  }, [loaded, geojson]);

  return (
    <div ref={wrapperRef} data-visual="skip">
      <MapShell height={`${height}px`} ariaLabel="Map of reference sites for the token probe; the table and swatches carry the same information">
        {(onMapError) =>
          mapStyle === null ? null : (
            <Map
              ref={mapRef}
              mapLib={mapLib}
              mapStyle={mapStyle}
              initialViewState={VIEW}
              interactive={false}
              attributionControl={false}
              onError={onMapError}
              onLoad={handleLoad}
            />
          )
        }
      </MapShell>
    </div>
  );
}
