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
      <div className="bg-gradient-to-br from-reef-light to-reef-accent/30 rounded-lg p-8 text-center h-[400px] flex items-center justify-center">
        <div className="animate-pulse">
          <Map className="w-16 h-16 text-reef-primary mx-auto mb-4 opacity-50" />
          <p className="text-gray-500">Loading map...</p>
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
      element.classList.add('ring-2', 'ring-reef-primary');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-reef-primary');
      }, 2000);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Reference Sites
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Explore the reference reef sites used for acoustic comparison and health
          classification
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-reef-light rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-reef-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{sites.length}</p>
              <p className="text-sm text-gray-500">Total Sites</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-status-healthy/10 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-status-healthy" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {statusCounts.healthy || 0}
              </p>
              <p className="text-sm text-gray-500">Healthy</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-status-degraded/10 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-status-degraded" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {statusCounts.degraded || 0}
              </p>
              <p className="text-sm text-gray-500">Degraded</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-status-restored-early/10 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-status-restored-early" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(statusCounts.restored_early || 0) + (statusCounts.restored_mid || 0)}
              </p>
              <p className="text-sm text-gray-500">Restored</p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Map */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Map className="w-5 h-5 mr-2 text-reef-primary" />
          Global Distribution
        </h2>

        {isLoading ? (
          <div className="bg-gradient-to-br from-reef-light to-reef-accent/30 rounded-lg p-8 text-center h-[400px] flex items-center justify-center">
            <div className="animate-pulse">
              <Map className="w-16 h-16 text-reef-primary mx-auto mb-4 opacity-50" />
              <p className="text-gray-500">Loading sites...</p>
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
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500 text-center">
            Click on a marker to view site details. Reference sites span Indonesia and Kenya.
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
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Failed to load sites</p>
                  <p className="text-sm text-red-600 mt-1">
                    {error instanceof Error ? error.message : 'An error occurred'}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="mt-3 text-sm text-red-700 hover:text-red-800 font-medium underline"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Toggle */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              All Sites
              {displaySites.length !== sites.length && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({displaySites.length} of {sites.length})
                </span>
              )}
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${
                  viewMode === 'grid'
                    ? 'bg-reef-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
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
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {sites.length === 0
                  ? 'No reference sites available'
                  : 'No sites match your filters'}
              </p>
              {sites.length > 0 && filteredSites.length === 0 && (
                <button
                  onClick={() => setFilteredSites(sites)}
                  className="mt-2 text-sm text-reef-primary hover:text-reef-secondary font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Data Source */}
      <div className="mt-12 bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Data Source</h3>
        <p className="text-sm text-gray-600">
          Reference site data comes from the{' '}
          <strong>MARRS (Mars Assisted Reef Restoration System)</strong> dataset,
          featuring underwater acoustic recordings from coral reefs in Indonesia
          and Kenya. These recordings capture the unique soundscapes of reefs at
          different health stages.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Source: UCL Figshare (DOI: 10.5522/04/29958062)
        </p>
      </div>
    </div>
  );
}
