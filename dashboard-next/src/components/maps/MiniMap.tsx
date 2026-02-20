'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SimilarSite, SITE_COORDINATES, STATUS_COLORS, Site } from '@/types';
import { SiteMarker } from './SiteMarker';
import { MapPin } from 'lucide-react';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface MiniMapProps {
  similarSites: SimilarSite[];
  highlightCount?: number;
  className?: string;
}

// Component to fit bounds when sites change
function FitBoundsController({ sites }: { sites: SimilarSite[] }) {
  const map = useMap();

  useMemo(() => {
    if (sites.length === 0) return;

    const validSites = sites.filter((site) => {
      const coords = SITE_COORDINATES[site.site_id];
      return coords !== undefined;
    });

    if (validSites.length === 0) return;

    const bounds = L.latLngBounds(
      validSites.map((site) => {
        const coords = SITE_COORDINATES[site.site_id];
        return [coords.lat, coords.lon] as [number, number];
      })
    );

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 8,
    });
  }, [sites, map]);

  return null;
}

export function MiniMap({
  similarSites,
  highlightCount = 3,
  className = '',
}: MiniMapProps) {
  // Filter to sites that have coordinates
  const sitesWithCoords = useMemo(() => {
    return similarSites.filter((site) => SITE_COORDINATES[site.site_id]);
  }, [similarSites]);

  // Get top sites to highlight
  const highlightedIds = useMemo(() => {
    return sitesWithCoords.slice(0, highlightCount).map((s) => s.site_id);
  }, [sitesWithCoords, highlightCount]);

  // Create similarity scores map
  const similarityScores = useMemo(() => {
    return sitesWithCoords.reduce((acc, site) => {
      acc[site.site_id] = site.similarity;
      return acc;
    }, {} as Record<string, number>);
  }, [sitesWithCoords]);

  // Convert SimilarSite to Site for marker
  const convertToSite = (ss: SimilarSite): Site => ({
    site_id: ss.site_id,
    country: ss.country,
    status: ss.status,
    latitude: SITE_COORDINATES[ss.site_id]?.lat,
    longitude: SITE_COORDINATES[ss.site_id]?.lon,
  });

  // Calculate initial center
  const initialCenter = useMemo<[number, number]>(() => {
    if (sitesWithCoords.length === 0) return [-3.5, 80];

    const lats = sitesWithCoords.map((s) => SITE_COORDINATES[s.site_id].lat);
    const lons = sitesWithCoords.map((s) => SITE_COORDINATES[s.site_id].lon);

    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lons) + Math.max(...lons)) / 2,
    ];
  }, [sitesWithCoords]);

  if (sitesWithCoords.length === 0) {
    return (
      <div
        className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}
        style={{ height: '200px' }}
      >
        <div className="text-center text-gray-500">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No location data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={initialCenter}
        zoom={5}
        scrollWheelZoom={false}
        zoomControl={false}
        dragging={true}
        touchZoom={true}
        className="w-full h-[200px] rounded-lg z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsController sites={sitesWithCoords} />

        {sitesWithCoords.map((site) => (
          <SiteMarker
            key={site.site_id}
            site={convertToSite(site)}
            isHighlighted={highlightedIds.includes(site.site_id)}
            similarity={site.similarity}
          />
        ))}
      </MapContainer>

      {/* Rank badges */}
      <div className="absolute top-2 left-2 z-[1000] space-y-1">
        {sitesWithCoords.slice(0, highlightCount).map((site, index) => (
          <div
            key={site.site_id}
            className="flex items-center space-x-1.5 bg-white/90 rounded px-2 py-1 text-xs shadow"
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
              style={{ backgroundColor: STATUS_COLORS[site.status] || '#666' }}
            >
              {index + 1}
            </span>
            <span className="font-medium text-gray-700">{site.site_id}</span>
            <span className="text-gray-500">
              {(site.similarity * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {/* Custom CSS */}
      <style jsx global>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
