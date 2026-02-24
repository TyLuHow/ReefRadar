'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { Site, ReefStatus, SITE_COORDINATES } from '@/types';
import { HealthLegend } from '@/components/map/HealthLegend';
import { MapControls } from '@/components/map/MapControls';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';
import { LoadingReef } from '@/components/ui/LoadingReef';
import { MapPin } from 'lucide-react';

// Dynamic import for deck.gl map (no SSR)
const ReefMap = dynamic(
  () => import('@/components/map/ReefMap').then((m) => m.ReefMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          height: '600px',
          background: 'rgba(26, 23, 20, 0.5)',
          border: '1px solid rgba(229, 225, 219, 0.05)',
        }}
      >
        <LoadingReef size="lg" text="Loading map..." />
      </div>
    ),
  },
);

const ALL_COUNTRIES = ['Indonesia', 'Australia', 'Kenya', 'Maldives', 'Mexico'];
const ALL_STATUSES: ReefStatus[] = [
  'healthy',
  'degraded',
  'restored_early',
  'restored_mid',
];

export default function MapPage() {
  const [selectedCountries, setSelectedCountries] =
    useState<string[]>(ALL_COUNTRIES);
  const [selectedStatuses, setSelectedStatuses] =
    useState<ReefStatus[]>(ALL_STATUSES);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const {
    data: sitesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.getSites(),
  });

  // Enrich sites with coordinates from SITE_COORDINATES
  const enrichedSites = useMemo(() => {
    if (!sitesData?.sites) return [];
    return sitesData.sites.map((site) => {
      const coords = SITE_COORDINATES[site.site_id];
      return {
        ...site,
        latitude: site.latitude ?? coords?.lat,
        longitude: site.longitude ?? coords?.lon,
        location: site.location ?? coords?.location,
        country:
          site.country ||
          (site.site_id.startsWith('ken') ? 'Kenya' : 'Indonesia'),
      };
    });
  }, [sitesData]);

  // Apply filters
  const filteredSites = useMemo(
    () =>
      enrichedSites.filter(
        (s) =>
          selectedCountries.includes(s.country) &&
          selectedStatuses.includes(s.status),
      ),
    [enrichedSites, selectedCountries, selectedStatuses],
  );

  const handleCountryToggle = useCallback(
    (country: string) => {
      setSelectedCountries((prev) =>
        prev.includes(country)
          ? prev.filter((c) => c !== country)
          : [...prev, country],
      );
    },
    [],
  );

  const handleStatusToggle = useCallback(
    (status: ReefStatus) => {
      setSelectedStatuses((prev) =>
        prev.includes(status)
          ? prev.filter((s) => s !== status)
          : [...prev, status],
      );
    },
    [],
  );

  const handleReset = useCallback(() => {
    setSelectedCountries(ALL_COUNTRIES);
    setSelectedStatuses(ALL_STATUSES);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <MapPin className="w-6 h-6" style={{ color: '#e9dcc9' }} />
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Monitoring Network
          </h1>
        </div>
        <p
          className="text-sm max-w-lg mx-auto"
          style={{ color: 'var(--text-muted)' }}
        >
          Explore the reference reef monitoring sites across 5 countries.
          Click a site to view details.
        </p>
      </div>

      {/* Map container */}
      {isLoading ? (
        <div
          className="flex items-center justify-center rounded-xl"
          style={{
            height: '600px',
            background: 'rgba(26, 23, 20, 0.5)',
            border: '1px solid rgba(229, 225, 219, 0.05)',
          }}
        >
          <LoadingReef size="lg" text="Fetching sites..." />
        </div>
      ) : error ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{
            height: '400px',
            background: 'rgba(26, 23, 20, 0.5)',
            border: '1px solid rgba(192, 128, 129, 0.2)',
          }}
        >
          <p style={{ color: '#c08081' }}>
            Failed to load sites. Please try refreshing.
          </p>
        </div>
      ) : (
        <div className="relative">
          <ReefMap
            sites={filteredSites}
            selectedSite={selectedSite}
            onSiteSelect={setSelectedSite}
            height="600px"
          />
          <HealthLegend />
          <MapControls
            selectedCountries={selectedCountries}
            selectedStatuses={selectedStatuses}
            onCountryToggle={handleCountryToggle}
            onStatusToggle={handleStatusToggle}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Site count */}
      <p
        className="text-xs text-center"
        style={{ color: 'var(--text-dim)' }}
      >
        Showing {filteredSites.length} of {enrichedSites.length} reference sites
      </p>

      {/* Caveats */}
      <CaveatsBanner defaultExpanded={false} />
    </div>
  );
}
