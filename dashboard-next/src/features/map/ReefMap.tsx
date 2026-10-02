'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Map,
  Source,
  Layer,
  type LayerProps,
  AttributionControl,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Site } from '@/types';
import type { RegionBounds } from '@/lib/regions';
import { mapLib } from './setup';
import { MapShell, prefersReducedMotion } from './MapShell';
import { SitePopup } from './SitePopup';
import {
  SITES_SOURCE_ID,
  INTERACTIVE_LAYER_IDS,
  SITE_LAYERS,
  buildSitesGeoJson,
  countSites,
} from './layers';

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const DEFAULT_VIEW_STATE = {
  latitude: 0,
  longitude: 80,
  zoom: 2,
  pitch: 30,
  bearing: 0,
};

/** Sets a boolean feature-state flag on one site while `id` is non-null. */
function useSiteFeatureState(
  mapRef: React.RefObject<MapRef | null>,
  ready: boolean,
  dataKey: unknown,
  id: string | null,
  key: 'hover' | 'selected',
) {
  useEffect(() => {
    if (!ready || id === null) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource(SITES_SOURCE_ID)) return;
    const target = { source: SITES_SOURCE_ID, id };
    map.setFeatureState(target, { [key]: true });
    return () => {
      try {
        if (map.getSource(SITES_SOURCE_ID)) map.setFeatureState(target, { [key]: false });
      } catch {
        // map already removed
      }
    };
  }, [mapRef, ready, dataKey, id, key]);
}

// --- Main ReefMap component --------------------------------------------------

interface ReefMapProps {
  sites: Site[];
  selectedSite?: Site | null;
  onSiteSelect?: (site: Site | null) => void;
  className?: string;
  height?: string;
  /** Region to fly to -- when this changes, the map animates to the region */
  flyToRegion?: RegionBounds | null;
}

export function ReefMap({
  sites,
  selectedSite: externalSelectedSite,
  onSiteSelect,
  className,
  height = '600px',
  flyToRegion,
}: ReefMapProps) {
  const [internalSelectedSite, setInternalSelectedSite] =
    useState<Site | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapRef | null>(null);
  const lastFlyToIdRef = useRef<string | null>(null);

  const selectedSite =
    externalSelectedSite !== undefined
      ? externalSelectedSite
      : internalSelectedSite;

  const handleSelect = useCallback(
    (site: Site | null) => {
      if (onSiteSelect) {
        onSiteSelect(site);
      } else {
        setInternalSelectedSite(site);
      }
    },
    [onSiteSelect],
  );

  const geojson = useMemo(() => buildSitesGeoJson(sites), [sites]);
  const { fullData, locationOnly } = useMemo(() => countSites(sites), [sites]);

  // Fly to region when flyToRegion prop changes (never re-fly the same region id)
  useEffect(() => {
    if (!flyToRegion || !mapReady) return;
    if (lastFlyToIdRef.current === flyToRegion.id) return;
    const map = mapRef.current;
    if (!map) return;
    lastFlyToIdRef.current = flyToRegion.id;

    map.flyTo({
      center: [flyToRegion.center.lon, flyToRegion.center.lat],
      zoom: flyToRegion.zoom,
      pitch: DEFAULT_VIEW_STATE.pitch,
      bearing: 0,
      duration: prefersReducedMotion() ? 0 : 1500,
    });
  }, [flyToRegion, mapReady]);

  // Hover and selected feedback (+2px on the core) through feature-state
  useSiteFeatureState(mapRef, mapReady, geojson, hoveredSiteId, 'hover');
  useSiteFeatureState(mapRef, mapReady, geojson, selectedSite?.site_id ?? null, 'selected');

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.site_id;
    setHoveredSiteId(typeof id === 'string' ? id : null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredSiteId(null);
  }, []);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.site_id;
      if (typeof id !== 'string') return;
      const site = sites.find((s) => s.site_id === id);
      if (site) handleSelect(site);
    },
    [sites, handleSelect],
  );

  const handleLoad = useCallback((e: { target: unknown }) => {
    // Test-only hook (T-03-08-02): set only by playwright.config.ts webServer.env.
    if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') {
      (window as unknown as { __reefMap?: unknown }).__reefMap = e.target;
    }
    setMapReady(true);
  }, []);

  return (
    <MapShell className={className} height={height} ariaLabel="Monitoring network map">
      <Map
        ref={mapRef}
        mapLib={mapLib}
        mapStyle={MAP_STYLE}
        initialViewState={DEFAULT_VIEW_STATE}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        cursor={hoveredSiteId ? 'pointer' : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onLoad={handleLoad}
        attributionControl={false}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {/* CARTO / OpenStreetMap attribution stays visible as text (T-03-08-03) */}
        <AttributionControl compact={false} position="bottom-right" />
        <Source id={SITES_SOURCE_ID} type="geojson" data={geojson} promoteId="site_id">
          {SITE_LAYERS.map((layer) => (
            <Layer key={layer.id} {...(layer as LayerProps)} />
          ))}
        </Source>
      </Map>

      {/* Selected site popup */}
      {selectedSite && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}
        >
          <SitePopup
            site={selectedSite}
            onClose={() => handleSelect(null)}
          />
        </div>
      )}

      {/* Legend for embedding vs location-only sites */}
      {locationOnly > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            zIndex: 10,
            background: 'rgba(26, 23, 20, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(229, 225, 219, 0.1)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'rgba(205, 133, 63, 0.9)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ color: '#e5e1db' }}>
              Full data ({fullData})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'rgba(205, 133, 63, 0.35)',
                border: '1.5px solid rgba(205, 133, 63, 0.6)',
                display: 'inline-block',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            />
            <span style={{ color: '#a8a29e' }}>
              Location only ({locationOnly})
            </span>
          </div>
        </div>
      )}
    </MapShell>
  );
}
