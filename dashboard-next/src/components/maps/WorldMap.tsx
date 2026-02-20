'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Site, SITE_COORDINATES, ReefStatus } from '@/types';
import { SiteMarker } from './SiteMarker';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface WorldMapProps {
  sites: Site[];
  highlightedSites?: string[];
  similarityScores?: Record<string, number>;
  onSiteClick?: (site: Site) => void;
  className?: string;
  height?: string;
  showLegend?: boolean;
}

// Component to fit bounds when sites change
function FitBoundsController({ sites }: { sites: Site[] }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length === 0) return;

    const validSites = sites.filter((site) => {
      const lat = site.latitude ?? SITE_COORDINATES[site.site_id]?.lat;
      const lon = site.longitude ?? SITE_COORDINATES[site.site_id]?.lon;
      return lat !== undefined && lon !== undefined;
    });

    if (validSites.length === 0) return;

    const bounds = L.latLngBounds(
      validSites.map((site) => {
        const lat = site.latitude ?? SITE_COORDINATES[site.site_id]?.lat ?? 0;
        const lon = site.longitude ?? SITE_COORDINATES[site.site_id]?.lon ?? 0;
        return [lat, lon] as [number, number];
      })
    );

    // Add padding to bounds
    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 10,
    });
  }, [sites, map]);

  return null;
}

// Legend component
function MapLegend({ statusCounts }: { statusCounts: Record<string, number> }) {
  const legendItems: { status: ReefStatus; label: string; color: string }[] = [
    { status: 'healthy', label: 'Healthy', color: '#2ECC71' },
    { status: 'degraded', label: 'Degraded', color: '#E74C3C' },
    { status: 'restored_early', label: 'Restored (Early)', color: '#F39C12' },
    { status: 'restored_mid', label: 'Restored (Mid)', color: '#3498DB' },
  ];

  return (
    <div className="absolute bottom-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">Reef Status</h4>
      <div className="space-y-1.5">
        {legendItems.map(({ status, label, color }) => {
          const count = statusCounts[status] || 0;
          if (count === 0) return null;
          return (
            <div key={status} className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-600">
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
  const mapRef = useRef<L.Map | null>(null);

  // Calculate status counts for legend
  const statusCounts = useMemo(() => {
    return sites.reduce((acc, site) => {
      acc[site.status] = (acc[site.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [sites]);

  // Calculate initial center - default to showing both Indonesia and Kenya
  const initialCenter = useMemo<[number, number]>(() => {
    if (sites.length === 0) return [-3.5, 80]; // Center between Indonesia and Kenya

    const validSites = sites.filter((site) => {
      const lat = site.latitude ?? SITE_COORDINATES[site.site_id]?.lat;
      const lon = site.longitude ?? SITE_COORDINATES[site.site_id]?.lon;
      return lat !== undefined && lon !== undefined;
    });

    if (validSites.length === 0) return [-3.5, 80];

    const lats = validSites.map(
      (s) => s.latitude ?? SITE_COORDINATES[s.site_id]?.lat ?? 0
    );
    const lons = validSites.map(
      (s) => s.longitude ?? SITE_COORDINATES[s.site_id]?.lon ?? 0
    );

    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lons) + Math.max(...lons)) / 2,
    ];
  }, [sites]);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <MapContainer
        center={initialCenter}
        zoom={4}
        scrollWheelZoom={true}
        className="w-full h-full rounded-lg z-0"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsController sites={sites} />

        {sites.map((site) => (
          <SiteMarker
            key={site.site_id}
            site={site}
            isHighlighted={highlightedSites.includes(site.site_id)}
            similarity={similarityScores[site.site_id]}
            onClick={() => onSiteClick?.(site)}
          />
        ))}
      </MapContainer>

      {showLegend && Object.keys(statusCounts).length > 0 && (
        <MapLegend statusCounts={statusCounts} />
      )}

      {/* Custom CSS for marker animations */}
      <style jsx global>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .leaflet-popup-content {
          margin: 12px;
        }
      `}</style>
    </div>
  );
}
