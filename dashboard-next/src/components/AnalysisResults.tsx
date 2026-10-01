'use client';

import dynamic from 'next/dynamic';
import { AnalysisResult, STATUS_COLORS, ReefStatus } from '@/types';
import { formatStatus, formatPercent, cn, getStatusBgColor } from '@/lib/utils';
import { ProbabilityBars } from '@/components/charts';
import { toIntegerPercentages } from '@/lib/probabilities';
import { similarSiteLabelText } from '@/lib/label-source';
import { Check, TrendingUp, MapPin, Map } from 'lucide-react';

// Dynamic import for MiniMap to avoid SSR issues with Leaflet
const MiniMap = dynamic(
  () => import('@/components/maps').then((m) => m.MiniMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-lg h-[200px] flex items-center justify-center"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="animate-pulse text-center">
          <Map className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface AnalysisResultsProps {
  result: AnalysisResult;
}

export function AnalysisResults({ result }: AnalysisResultsProps) {
  const { classification, similar_sites, similar_sites_error, caveats } = result;

  if (!classification) {
    return (
      <div className="glass-panel p-6">
        <p className="text-center" style={{ color: 'var(--text-muted)' }}>No classification results available</p>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[classification.label] || '#666';
  const integerPercentages = toIntegerPercentages(classification.probabilities);
  const topPercentage = integerPercentages[classification.label] ?? 0;

  return (
    <div className="space-y-6">
      {/* Main Classification Card */}
      <div className="glass-panel overflow-hidden">
        <div
          className="p-6 text-white"
          style={{ backgroundColor: statusColor }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium uppercase tracking-wide">
                Result
              </p>
              <h2 className="text-3xl font-bold mt-1">
                Most similar to {formatStatus(classification.label)} reference recordings
              </h2>
              {classification.model_version && (
                <p className="text-white/70 text-xs mt-1">
                  Model: {classification.model_version}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm">Model probability</p>
              <p className="text-4xl font-bold">
                {topPercentage}%
              </p>
            </div>
          </div>
        </div>

        {/* Region status is shown as a separate note by RegionWarning
            (rendered at the page level) -- not duplicated here. */}

        {/* Animated Probability Distribution */}
        <div className="p-6">
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
            Probability Distribution
          </h3>
          <ProbabilityBars
            probabilities={classification.probabilities}
            highlightedStatus={classification.label}
            animated={true}
          />
        </div>
      </div>

      {/* Similar Sites with Map */}
      {similar_sites && similar_sites.length > 0 && (
        <div className="glass-panel overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center" style={{ color: 'var(--text-primary)' }}>
              <TrendingUp className="w-5 h-5 mr-2 text-ochre" />
              Most Similar Reference Sites
            </h3>

            {/* Mini Map showing similar sites */}
            <div className="mb-6">
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                <MiniMap
                  similarSites={similar_sites}
                  highlightCount={3}
                />
              </div>
              <p className="text-xs mt-2 text-center flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                <MapPin className="w-3 h-3 mr-1" />
                Geographic location of similar reference sites
              </p>
            </div>

            {/* Similar Sites List */}
            <div className="space-y-3">
              {similar_sites.slice(0, 5).map((site, index) => {
                const siteStatusColor = STATUS_COLORS[site.status] || '#666';
                const isTopMatch = index === 0;

                return (
                  <div
                    key={site.site_id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg transition-all',
                    )}
                    style={{
                      background: isTopMatch
                        ? 'rgba(205, 133, 63, 0.08)'
                        : 'var(--glass-bg)',
                      border: isTopMatch
                        ? '1px solid rgba(205, 133, 63, 0.2)'
                        : '1px solid transparent',
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold',
                          isTopMatch ? '' : 'opacity-80'
                        )}
                        style={{ backgroundColor: siteStatusColor }}
                      >
                        {isTopMatch ? <Check className="w-4 h-4" /> : index + 1}
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: isTopMatch ? '#cd853f' : 'var(--text-primary)' }}>
                          {site.site_id}
                          {isTopMatch && (
                            <span className="ml-2 text-xs bg-ochre text-white px-2 py-0.5 rounded-full">
                              Best Match
                            </span>
                          )}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {site.country}
                          {similarSiteLabelText(site)
                            ? ` - ${similarSiteLabelText(site)}`
                            : ` - ${formatStatus(site.status)} (label source not reported)`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="text-lg font-semibold"
                        style={{ color: isTopMatch ? '#cd853f' : 'var(--text-primary)' }}
                      >
                        {formatPercent(site.similarity)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>similarity</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* More sites indicator */}
            {similar_sites.length > 5 && (
              <p className="text-sm text-center mt-4" style={{ color: 'var(--text-muted)' }}>
                + {similar_sites.length - 5} more sites
              </p>
            )}
          </div>
        </div>
      )}

      {/* Similar sites unavailable: say so instead of hiding the section */}
      {(!similar_sites || similar_sites.length === 0) && (
        <div className="glass-panel p-6" role="status">
          <h3 className="text-lg font-semibold mb-2 flex items-center" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp className="w-5 h-5 mr-2 text-ochre" />
            Most Similar Reference Sites
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {similar_sites_error ||
              'Similar-site comparison is not available for this analysis, so no reference sites are shown.'}
          </p>
        </div>
      )}

      {/* Caveats */}
      {caveats && (
        <div
          className="rounded-lg p-4"
          style={{ background: 'rgba(184, 134, 11, 0.1)', border: '1px solid rgba(184, 134, 11, 0.3)' }}
        >
          <p className="text-sm" style={{ color: 'rgba(184, 134, 11, 0.85)' }}>{caveats}</p>
        </div>
      )}
    </div>
  );
}
