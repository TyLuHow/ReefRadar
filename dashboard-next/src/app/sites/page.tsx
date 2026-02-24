'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { SiteCard, SiteCardSkeleton } from '@/components/SiteCard';
import { SiteFilters } from '@/components/sites';
import { STATUS_COLORS, Site } from '@/types';
import { formatStatus } from '@/lib/utils';
import { Map, AlertCircle, Globe, Activity, Layers } from 'lucide-react';

// Dynamic import for map to avoid SSR issues with Leaflet
const WorldMap = dynamic(
  () => import('@/components/maps').then((m) => m.WorldMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-lg p-8 text-center h-[400px] flex items-center justify-center"
        style={{ background: 'rgba(37, 34, 32, 0.5)', border: '1px solid rgba(229, 225, 219, 0.1)' }}
      >
        <div className="animate-pulse">
          <Map className="w-16 h-16 text-ochre mx-auto mb-4 opacity-50" />
          <p style={{ color: 'var(--text-muted)' }}>Loading map...</p>
        </div>
      </div>
    ),
  }
);

export default function SitesPage() {
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const {
    data: sitesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.getSites(),
  });

  // Calculate statistics
  const sites = sitesData?.sites || [];
  const displaySites = filteredSites.length > 0 || sites.length === 0 ? filteredSites : sites;

  const statusCounts = sites.reduce((acc, site) => {
    acc[site.status] = (acc[site.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleFilteredSitesChange = useCallback((filtered: Site[]) => {
    setFilteredSites(filtered);
  }, []);

  const handleSiteClick = useCallback((site: Site) => {
    setSelectedSite(site);
    // Scroll to site card
    const element = document.getElementById(`site-${site.site_id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-ochre');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-ochre');
      }, 2000);
    }
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, var(--bg-abyss) 0%, var(--bg-depths) 40%, var(--bg-surface) 100%)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Reference Sites
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Explore the reference reef sites used for acoustic comparison and health
            classification
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass-panel p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                <Globe className="w-5 h-5 text-ochre" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{sites.length}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Sites</p>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(205, 133, 63, 0.1)' }}>
                <Activity className="w-5 h-5 text-status-healthy" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {statusCounts.healthy || 0}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Healthy</p>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(107, 101, 96, 0.15)' }}>
                <Activity className="w-5 h-5 text-status-degraded" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {statusCounts.degraded || 0}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Degraded</p>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139, 115, 85, 0.15)' }}>
                <Activity className="w-5 h-5 text-status-restoring-early" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {(statusCounts.restored_early || 0) + (statusCounts.restored_mid || 0)}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Restored</p>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Map */}
        <div className="glass-panel p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center" style={{ color: 'var(--text-primary)' }}>
            <Map className="w-5 h-5 mr-2 text-ochre" />
            Global Distribution
          </h2>

          {isLoading ? (
            <div
              className="rounded-lg p-8 text-center h-[400px] flex items-center justify-center"
              style={{ background: 'rgba(37, 34, 32, 0.5)', border: '1px solid rgba(229, 225, 219, 0.1)' }}
            >
              <div className="animate-pulse">
                <Map className="w-16 h-16 text-ochre mx-auto mb-4 opacity-50" />
                <p style={{ color: 'var(--text-muted)' }}>Loading sites...</p>
              </div>
            </div>
          ) : (
            <WorldMap
              sites={displaySites}
              highlightedSites={selectedSite ? [selectedSite.site_id] : []}
              onSiteClick={handleSiteClick}
              height="400px"
              showLegend={true}
            />
          )}

          {/* Map Legend */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(229, 225, 219, 0.1)' }}>
            <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Click on a marker to view site details. Reference sites span 5 countries: Indonesia, Australia, Kenya, Maldives, and Mexico.
            </p>
          </div>
        </div>

        {/* Filters and Sites Grid in Two Columns */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            {!isLoading && sites.length > 0 && (
              <SiteFilters
                sites={sites}
                onFilteredSitesChange={handleFilteredSitesChange}
                className="sticky top-4"
              />
            )}
          </div>

          {/* Sites Grid */}
          <div className="lg:col-span-3">
            {/* Error State */}
            {error && (
              <div
                className="rounded-xl p-6 mb-8"
                style={{ background: 'rgba(192, 128, 129, 0.1)', border: '1px solid rgba(192, 128, 129, 0.3)' }}
              >
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#c08081' }} />
                  <div>
                    <p className="font-medium" style={{ color: '#c08081' }}>Failed to load sites</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                      {error instanceof Error ? error.message : 'An error occurred'}
                    </p>
                    <button
                      onClick={() => refetch()}
                      className="mt-3 text-sm font-medium underline text-ochre hover:text-pale-gold"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Toggle */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                All Sites
                {displaySites.length !== sites.length && (
                  <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
                    ({displaySites.length} of {sites.length})
                  </span>
                )}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg ${
                    viewMode === 'grid'
                      ? 'bg-ochre text-white'
                      : 'text-warm-gray hover:bg-white/5'
                  }`}
                  style={viewMode !== 'grid' ? { background: 'var(--glass-bg)' } : undefined}
                  title="Grid view"
                >
                  <Layers className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-2 gap-6">
                {[...Array(4)].map((_, i) => (
                  <SiteCardSkeleton key={i} />
                ))}
              </div>
            ) : displaySites.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {displaySites.map((site) => (
                  <div
                    key={site.site_id}
                    id={`site-${site.site_id}`}
                    className="transition-all duration-300"
                  >
                    <SiteCard site={site} />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="text-center py-12 rounded-xl"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
              >
                <Globe className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
                <p style={{ color: 'var(--text-muted)' }}>
                  {sites.length === 0
                    ? 'No reference sites available'
                    : 'No sites match your filters'}
                </p>
                {sites.length > 0 && filteredSites.length === 0 && (
                  <button
                    onClick={() => setFilteredSites(sites)}
                    className="mt-2 text-sm text-ochre hover:text-pale-gold font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Data Source */}
        <div className="mt-12 glass-panel p-6">
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Data Source</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Reference site data comes from the{' '}
            <strong>MARRS (Mars Assisted Reef Restoration System)</strong> dataset,
            featuring underwater acoustic recordings from coral reefs across
            Indonesia, Australia, Kenya, Maldives, and Mexico. These recordings
            capture the unique soundscapes of reefs at different health stages.
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Source: UCL Figshare (DOI: 10.5522/04/29958062)
          </p>
        </div>
      </div>
    </div>
  );
}
