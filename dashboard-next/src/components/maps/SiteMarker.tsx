'use client';

import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Site, STATUS_COLORS, SITE_COORDINATES } from '@/types';
import { formatStatus } from '@/lib/utils';

interface SiteMarkerProps {
  site: Site;
  isHighlighted?: boolean;
  similarity?: number;
  onClick?: () => void;
}

// Create custom colored marker icon
function createMarkerIcon(color: string, isHighlighted: boolean = false): L.DivIcon {
  const size = isHighlighted ? 16 : 12;
  const borderWidth = isHighlighted ? 3 : 2;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: ${borderWidth}px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ${isHighlighted ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
      "></div>
    `,
    iconSize: [size + borderWidth * 2, size + borderWidth * 2],
    iconAnchor: [(size + borderWidth * 2) / 2, (size + borderWidth * 2) / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function SiteMarker({ site, isHighlighted = false, similarity, onClick }: SiteMarkerProps) {
  // Try to get coordinates from site or fallback to SITE_COORDINATES
  const lat = site.latitude ?? SITE_COORDINATES[site.site_id]?.lat;
  const lon = site.longitude ?? SITE_COORDINATES[site.site_id]?.lon;

  if (lat === undefined || lon === undefined) {
    return null;
  }

  const statusColor = STATUS_COLORS[site.status] || '#666';
  const icon = createMarkerIcon(statusColor, isHighlighted);

  return (
    <Marker
      position={[lat, lon]}
      icon={icon}
      eventHandlers={{
        click: onClick,
      }}
    >
      <Popup>
        <div className="min-w-[180px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-900">{site.site_id}</h3>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: statusColor }}
            >
              {formatStatus(site.status)}
            </span>
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <p className="flex items-center">
              <span className="font-medium mr-1">Country:</span>
              {site.country}
            </p>
            {SITE_COORDINATES[site.site_id]?.location && (
              <p className="flex items-center">
                <span className="font-medium mr-1">Region:</span>
                {SITE_COORDINATES[site.site_id].location.split(',')[0]}
              </p>
            )}
            <p className="text-xs text-gray-400">
              {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          </div>

          {similarity !== undefined && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-sm">
                <span className="font-medium text-gray-700">Similarity:</span>{' '}
                <span className="font-bold text-ochre">
                  {(similarity * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

// Export the icon creator for use in other components
export { createMarkerIcon };
