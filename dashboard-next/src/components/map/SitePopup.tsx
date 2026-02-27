'use client';

import { X } from 'lucide-react';
import { Site, ReefStatus } from '@/types';
import { formatStatus } from '@/lib/utils';

const STATUS_DOT_COLORS: Record<ReefStatus, string> = {
  healthy: '#cd853f',
  degraded: '#6b6560',
  restored_early: '#8b7355',
  restored_mid: '#c08081',
  unknown: '#a8a29e',
};

interface SitePopupProps {
  site: Site;
  onClose: () => void;
}

export function SitePopup({ site, onClose }: SitePopupProps) {
  const dotColor = STATUS_DOT_COLORS[site.status] || '#888';
  const countryName =
    site.country === 'Indonesia'
      ? 'Indonesia'
      : site.country === 'Kenya'
        ? 'Kenya'
        : site.country || 'Unknown';

  return (
    <div
      className="rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
      style={{
        background: 'rgba(26, 23, 20, 0.95)',
        border: '1px solid rgba(229, 225, 219, 0.1)',
        backdropFilter: 'blur(12px)',
        width: '260px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3
          className="text-sm font-bold tracking-wide"
          style={{ color: 'var(--text-primary)' }}
        >
          {countryName}{' '}
          <span style={{ color: 'var(--text-muted)' }}>/ {site.site_id}</span>
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Close popup"
        >
          <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 space-y-2">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-xs font-medium" style={{ color: dotColor }}>
            {formatStatus(site.status)}
          </span>
        </div>

        {/* Coordinates */}
        {site.latitude !== undefined && site.longitude !== undefined && (
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
          </div>
        )}

        {/* Location */}
        {site.location && (
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {site.location}
          </div>
        )}

        {/* Embedding status */}
        {site.has_embedding === false && (
          <div
            className="text-xs px-2 py-0.5 rounded-full inline-block mt-1"
            style={{
              color: 'rgba(168, 162, 158, 0.8)',
              background: 'rgba(168, 162, 158, 0.1)',
              border: '1px solid rgba(168, 162, 158, 0.2)',
            }}
          >
            Location only -- no audio data
          </div>
        )}
      </div>
    </div>
  );
}
