'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Map, NavigationControl, AttributionControl, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STATUS_COLORS, type ReefStatus, type Site } from '@/types';
import { mapLib } from './setup';
import { MapShell, prefersReducedMotion } from './MapShell';
import { SiteMarker } from './SiteMarker';
import { WORLD_MAP_STYLE } from './style';

interface WorldMapProps {
  sites: Site[];
  highlightedSites?: string[];
  similarityScores?: Record<string, number>;
  onSiteClick?: (site: Site) => void;
  className?: string;
  height?: string;
  showLegend?: boolean;
}

type PlacedSite = Site & { latitude: number; longitude: number };

function hasCoordinates(site: Site): site is PlacedSite {
  return site.latitude !== undefined && site.longitude !== undefined;
}

// Legend rows (the status colour comes from STATUS_COLORS, never a second copy).
// Known gap carried forward: no Unknown row although some sites are unknown (Phase 4/6).
const LEGEND_ITEMS: { status: ReefStatus; label: string }[] = [
  { status: 'healthy', label: 'Healthy' },
  { status: 'degraded', label: 'Degraded' },
  { status: 'restored_early', label: 'Restored (Early)' },
  { status: 'restored_mid', label: 'Restored (Mid)' },
];

function initialView(sites: Site[]) {
  const placed = sites.filter(hasCoordinates);
  if (placed.length === 0) return { latitude: 0, longitude: 80, zoom: 2 };
  const lats = placed.map((s) => s.latitude);
  const lons = placed.map((s) => s.longitude);
  return {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
    zoom: 2,
  };
}

export function MapLegend({ statusCounts }: { statusCounts: Record<string, number> }) {
  return (
    <div
      className="absolute bottom-4 right-4 z-10 rounded-lg shadow-lg p-3"
      style={{
        background: 'rgba(26, 23, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(229, 225, 219, 0.1)',
      }}
    >
      <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        Reef Status
      </h4>
      <div className="space-y-1.5">
        {LEGEND_ITEMS.map(({ status, label }) => {
          const count = statusCounts[status] || 0;
          if (count === 0) return null;
          return (
            <div key={status} className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full shadow-sm"
                data-testid={`legend-dot-${status}`}
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {label} ({count})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorldMap({
  sites,
  highlightedSites = [],
  similarityScores = {},
  onSiteClick,
  className = '',
  height = '400px',
  showLegend = true,
}: WorldMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const fittedOnce = useRef(false);
  const [ready, setReady] = useState(false);

  const statusCounts = useMemo(
    () =>
      sites.reduce(
        (acc, site) => {
          acc[site.status] = (acc[site.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [sites],
  );

  // Initial view: bbox midpoint of the first sites (or lat 0 / lon 80), converted once to
  // [lon, lat]. Later site changes refit below instead of recentring.
  const [initialViewState] = useState(() => initialView(sites));

  // Fit the sites (padding 50, maxZoom 10) once the map is ready and whenever they change.
  useEffect(() => {
    if (!ready) return;
    const placed = sites.filter(hasCoordinates);
    if (placed.length === 0) return;
    const lons = placed.map((s) => s.longitude);
    const lats = placed.map((s) => s.latitude);
    const animate = fittedOnce.current && !prefersReducedMotion();
    fittedOnce.current = true;
    mapRef.current?.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 50, maxZoom: 10, duration: animate ? 1000 : 0 },
    );
  }, [sites, ready]);

  return (
    <MapShell height={height} className={`relative ${className}`} ariaLabel="Map of reef recording sites">
      <Map
        ref={mapRef}
        mapLib={mapLib}
        mapStyle={WORLD_MAP_STYLE}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        scrollZoom={true}
        dragRotate={false}
        attributionControl={false}
        onLoad={() => setReady(true)}
      >
        <AttributionControl compact={false} position="bottom-right" />
        <NavigationControl showCompass={false} showZoom position="top-left" />

        {sites.map((site) => (
          <SiteMarker
            key={site.site_id}
            site={site}
            isHighlighted={highlightedSites.includes(site.site_id)}
            similarity={similarityScores[site.site_id]}
            onClick={() => onSiteClick?.(site)}
          />
        ))}
      </Map>

      {showLegend && Object.keys(statusCounts).length > 0 && <MapLegend statusCounts={statusCounts} />}
    </MapShell>
  );
}
