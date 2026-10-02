'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SimilarSite, STATUS_COLORS, Site } from '@/types';
import { useSiteIndex, type SiteIndexEntry } from '@/features/contract';
import { SiteMarker } from './SiteMarker';
import { MapPin, Map } from 'lucide-react';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface MiniMapProps {
  similarSites: SimilarSite[];
  highlightCount?: number;
  className?: string;
}

// Component to fit bounds when sites change
function FitBoundsController({
  sites,
  index,
}: {
  sites: SimilarSite[];
  index: Record<string, SiteIndexEntry>;
}) {
  const map = useMap();

  useMemo(() => {
    if (sites.length === 0) return;

    const validSites = sites.filter((site) => index[site.site_id] !== undefined);

    if (validSites.length === 0) return;

    const bounds = L.latLngBounds(
      validSites.map((site) => {
        const coords = index[site.site_id];
        return [coords.lat, coords.lon] as [number, number];
      })
    );

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 8,
    });
  }, [sites, index, map]);

  return null;
}

export function MiniMap({
  similarSites,
  highlightCount = 3,
  className = '',
}: MiniMapProps) {
  // Coordinates come from the contract (02-09); the index is empty while loading or on error.
  const { data: siteIndex, isLoading: indexLoading } = useSiteIndex();
  const index = useMemo(() => siteIndex ?? {}, [siteIndex]);

  // Filter to sites that have coordinates
  const sitesWithCoords = useMemo(() => {
    return similarSites.filter((site) => index[site.site_id]);
  }, [similarSites, index]);

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
    latitude: index[ss.site_id]?.lat,
    longitude: index[ss.site_id]?.lon,
    location: index[ss.site_id]?.location,
  });

  // Calculate initial center
  const initialCenter = useMemo<[number, number]>(() => {
    if (sitesWithCoords.length === 0) return [-3.5, 80];

    const lats = sitesWithCoords.map((s) => index[s.site_id].lat);
    const lons = sitesWithCoords.map((s) => index[s.site_id].lon);

    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lons) + Math.max(...lons)) / 2,
    ];
  }, [sitesWithCoords, index]);

  // While the contract is loading, show the same panel AnalysisResults shows for
  // the dynamic import, not the "no location data" state.
  if (indexLoading) {
    return (
      <div
        className={`rounded-lg h-[200px] flex items-center justify-center ${className}`}
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="animate-pulse text-center">
          <Map className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
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
        <FitBoundsController sites={sitesWithCoords} index={index} />

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
            className="flex items-center space-x-1.5 rounded px-2 py-1 text-xs shadow"
            style={{ background: 'rgba(26, 23, 20, 0.9)', backdropFilter: 'blur(8px)' }}
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
              style={{ backgroundColor: STATUS_COLORS[site.status] || '#666' }}
            >
              {index + 1}
            </span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{site.site_id}</span>
            <span style={{ color: 'var(--text-muted)' }}>
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
