'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, Popup } from 'react-map-gl/maplibre';
import { STATUS_COLORS, type Site } from '@/types';
import { formatStatus } from '@/lib/utils';

interface SiteMarkerProps {
  site: Site;
  isHighlighted?: boolean;
  similarity?: number;
  onClick?: () => void;
}

/** Accessible name of a site marker: never the generic "Marker". */
export function siteMarkerLabel(site: Pick<Site, 'site_id' | 'country' | 'status'>): string {
  return `${site.site_id}, ${site.country}, ${formatStatus(site.status)}`;
}

export function SiteMarker({ site, isHighlighted = false, similarity, onClick }: SiteMarkerProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the marker that owns the popup (Escape and the close button).
    buttonRef.current?.focus();
  }, []);

  // MapLibre popups ignore Escape: close it here while open (T-03-09-03).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Coordinates and location come from the contract record (02-09).
  const lat = site.latitude;
  const lon = site.longitude;

  if (lat === undefined || lon === undefined) {
    return null;
  }

  const statusColor = STATUS_COLORS[site.status] || '#666';
  const size = isHighlighted ? 16 : 12;
  const borderWidth = isHighlighted ? 3 : 2;

  return (
    <>
      <Marker longitude={lon} latitude={lat} anchor="center">
        <button
          ref={buttonRef}
          type="button"
          aria-label={siteMarkerLabel(site)}
          aria-expanded={open}
          className={isHighlighted ? 'marker-pulse' : undefined}
          onClick={() => {
            setOpen(true);
            onClick?.();
          }}
          style={{
            display: 'block',
            boxSizing: 'content-box',
            width: `${size}px`,
            height: `${size}px`,
            padding: 0,
            backgroundColor: statusColor,
            border: `${borderWidth}px solid white`,
            borderRadius: '50%',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
        />
      </Marker>

      {open && (
        <Popup
          longitude={lon}
          latitude={lat}
          anchor="bottom"
          offset={(size + borderWidth * 2) / 2 + 2}
          maxWidth="300px"
          closeOnClick={false}
          onClose={close}
        >
          <div className="min-w-[180px] pr-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900 mr-2">{site.site_id}</h3>
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
              {site.location && (
                <p className="flex items-center">
                  <span className="font-medium mr-1">Region:</span>
                  {site.location.split(',')[0]}
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
                  <span className="font-bold text-ochre">{(similarity * 100).toFixed(1)}%</span>
                </p>
              </div>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}
