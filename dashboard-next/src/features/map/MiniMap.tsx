'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Map, AttributionControl, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Map as MapIcon } from 'lucide-react';
import { STATUS_COLORS, type SimilarSite, type Site } from '@/types';
import { useSiteIndex } from '@/features/contract';
import { mapLib } from './setup';
import { MapShell } from './MapShell';
import { SiteMarker } from './SiteMarker';
import { MINI_MAP_STYLE } from './style';

interface MiniMapProps {
  similarSites: SimilarSite[];
  highlightCount?: number;
  className?: string;
}

export function MiniMap({ similarSites, highlightCount = 3, className = '' }: MiniMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);

  // Coordinates come from the contract (02-09); the index is empty while loading or on error.
  const { data: siteIndex, isLoading: indexLoading } = useSiteIndex();
  const index = useMemo(() => siteIndex ?? {}, [siteIndex]);

  // Filter to sites that have coordinates
  const sitesWithCoords = useMemo(
    () => similarSites.filter((site) => index[site.site_id]),
    [similarSites, index],
  );

  const highlightedIds = useMemo(
    () => sitesWithCoords.slice(0, highlightCount).map((s) => s.site_id),
    [sitesWithCoords, highlightCount],
  );

  const convertToSite = (ss: SimilarSite): Site => ({
    site_id: ss.site_id,
    country: ss.country,
    status: ss.status,
    latitude: index[ss.site_id]?.lat,
    longitude: index[ss.site_id]?.lon,
    location: index[ss.site_id]?.location,
  });

  // Initial centre (bbox midpoint of the resolved sites, or lat -3.5 / lon 80), [lon, lat] for
  // MapLibre. The map only reads it at mount; fitBounds below does the real framing.
  const initialViewState = useMemo(() => {
    if (sitesWithCoords.length === 0) return { latitude: -3.5, longitude: 80, zoom: 5 };
    const lats = sitesWithCoords.map((s) => index[s.site_id].lat);
    const lons = sitesWithCoords.map((s) => index[s.site_id].lon);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
      zoom: 5,
    };
  }, [sitesWithCoords, index]);

  // Fit the similar sites (padding 30, maxZoom 8) once the map is ready and whenever they
  // change. This is an effect, not render-time work (the Leaflet version ran it in useMemo).
  useEffect(() => {
    if (!ready || sitesWithCoords.length === 0) return;
    const lons = sitesWithCoords.map((s) => index[s.site_id].lon);
    const lats = sitesWithCoords.map((s) => index[s.site_id].lat);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 30, maxZoom: 8, duration: 0 },
    );
  }, [ready, sitesWithCoords, index]);

  // While the contract is loading, show the same panel AnalysisResults shows for
  // the dynamic import, not the "no location data" state.
  if (indexLoading) {
    return (
      <div
        className={`rounded-lg h-[200px] flex items-center justify-center ${className}`}
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="animate-pulse text-center">
          <MapIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading map...</p>
        </div>
      </div>
    );
  }

  if (sitesWithCoords.length === 0) {
    return (
      <div
        className={`rounded-lg flex items-center justify-center ${className}`}
        style={{ height: '200px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="text-center" style={{ color: 'var(--text-muted)' }}>
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No location data available</p>
        </div>
      </div>
    );
  }

  return (
    <MapShell
      height="200px"
      className={`relative ${className}`}
      ariaLabel="Map of similar reference sites"
      compactFallback
    >
      {(onMapError) => (
      <>
      <Map
        onError={onMapError}
        ref={mapRef}
        mapLib={mapLib}
        mapStyle={MINI_MAP_STYLE}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        scrollZoom={false}
        dragPan={true}
        touchZoomRotate={true}
        dragRotate={false}
        attributionControl={false}
        onLoad={() => {
          // Pinch zooms but never rotates (Leaflet had no rotation).
          mapRef.current?.getMap?.().touchZoomRotate?.disableRotation?.();
          setReady(true);
        }}
      >
        <AttributionControl compact={false} position="bottom-right" />

        {sitesWithCoords.map((site) => (
          <SiteMarker
            key={site.site_id}
            site={convertToSite(site)}
            isHighlighted={highlightedIds.includes(site.site_id)}
            similarity={site.similarity}
          />
        ))}
      </Map>

      {/* Rank badges */}
      <div className="absolute top-2 left-2 z-10 space-y-1">
        {sitesWithCoords.slice(0, highlightCount).map((site, rank) => (
          <div
            key={site.site_id}
            className="flex items-center space-x-1.5 rounded-sm px-2 py-1 text-xs shadow-sm"
            style={{ background: 'rgba(26, 23, 20, 0.9)', backdropFilter: 'blur(8px)' }}
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
              style={{ backgroundColor: STATUS_COLORS[site.status] || '#666' }}
            >
              {rank + 1}
            </span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{site.site_id}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {(site.similarity * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
      </>
      )}
    </MapShell>
  );
}
