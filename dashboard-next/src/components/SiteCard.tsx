'use client';

import { useState } from 'react';
import { Site, SITE_COORDINATES, STATUS_COLORS } from '@/types';
import { formatStatus, cn } from '@/lib/utils';
import { MapPin, Globe, ChevronDown, Waves, Database, Navigation } from 'lucide-react';

interface SiteCardProps {
  site: Site;
  expanded?: boolean;
}

export function SiteCard({ site, expanded: initialExpanded = false }: SiteCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const coords = SITE_COORDINATES[site.site_id];
  const statusColor = STATUS_COLORS[site.status] || '#666';

  // Determine site type label from site_id
  const getSiteType = (siteId: string): string => {
    if (siteId.includes('_H')) return 'Healthy Reference';
    if (siteId.includes('_D')) return 'Degraded Reference';
    if (siteId.includes('_N')) return 'Restoration Site';
    return 'Reference Site';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
      {/* Status bar */}
      <div
        className="h-1.5"
        style={{ backgroundColor: statusColor }}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{site.site_id}</h3>
            <p className="text-sm text-gray-500 flex items-center mt-1">
              <Globe className="w-4 h-4 mr-1" />
              {site.country}
            </p>
          </div>
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              'text-white'
            )}
            style={{ backgroundColor: statusColor }}
          >
            {formatStatus(site.status)}
          </span>
        </div>

        {/* Location */}
        {coords && (
          <div className="text-sm text-gray-600 mb-4">
            <div className="flex items-start">
              <MapPin className="w-4 h-4 mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
              <div>
                <p>{coords.location}</p>
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expand Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center py-2 text-sm text-gray-500 hover:text-reef-primary transition-colors border-t border-gray-100 mt-2 -mb-1"
        >
          <span className="mr-1">{isExpanded ? 'Less details' : 'More details'}</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform',
              isExpanded ? 'rotate-180' : ''
            )}
          />
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            {/* Site Type */}
            <div className="flex items-center text-sm">
              <Waves className="w-4 h-4 mr-2 text-gray-400" />
              <span className="text-gray-600">Site Type:</span>
              <span className="ml-2 font-medium text-gray-900">
                {getSiteType(site.site_id)}
              </span>
            </div>

            {/* Embedding Info */}
            <div className="flex items-center text-sm">
              <Database className="w-4 h-4 mr-2 text-gray-400" />
              <span className="text-gray-600">Embedding:</span>
              <span className="ml-2 font-medium text-gray-900">
                1280 dimensions
              </span>
            </div>

            {/* Navigation Link */}
            {coords && (
              <a
                href={`https://www.google.com/maps?q=${coords.lat},${coords.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm text-reef-primary hover:text-reef-secondary transition-colors"
              >
                <Navigation className="w-4 h-4 mr-2" />
                View on Google Maps
              </a>
            )}

            {/* Status Badge with description */}
            <div className="bg-gray-50 rounded-lg p-3 mt-3">
              <p className="text-xs text-gray-500 mb-1">Status Description</p>
              <p className="text-sm text-gray-700">
                {site.status === 'healthy' && 'Reference site with diverse fish communities, abundant snapping shrimp activity, and complex acoustic signatures characteristic of thriving reef ecosystems.'}
                {site.status === 'degraded' && 'Reference site with reduced acoustic diversity and lower biological sound production, indicating diminished reef-associated fauna.'}
                {site.status === 'restored_early' && 'Recently restored site (<3 months) showing initial signs of acoustic recovery in biological sound production.'}
                {site.status === 'restored_mid' && 'Restored site (32-53 months) with soundscapes approaching healthy reference characteristics.'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Acoustic monitoring measures biological sound activity, not coral tissue health directly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Skeleton for loading state
export function SiteCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="h-1.5 bg-gray-200" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="h-6 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-32" />
          </div>
          <div className="h-6 bg-gray-200 rounded-full w-20" />
        </div>
        <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-36" />
      </div>
    </div>
  );
}
