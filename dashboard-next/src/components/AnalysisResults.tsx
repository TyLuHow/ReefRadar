'use client';

import dynamic from 'next/dynamic';
import { AnalysisResult, STATUS_COLORS, ReefStatus } from '@/types';
import { formatStatus, formatPercent, cn, getStatusBgColor } from '@/lib/utils';
import { ProbabilityBars } from '@/components/charts';
import { Check, TrendingUp, MapPin, Map, AlertTriangle, Globe } from 'lucide-react';

// Dynamic import for MiniMap to avoid SSR issues with Leaflet
const MiniMap = dynamic(
  () => import('@/components/maps').then((m) => m.MiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="bg-gray-100 rounded-lg h-[200px] flex items-center justify-center">
        <div className="animate-pulse text-center">
          <Map className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface AnalysisResultsProps {
  result: AnalysisResult;
}

export function AnalysisResults({ result }: AnalysisResultsProps) {
  const { classification, similar_sites, caveats } = result;

  if (!classification) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-500 text-center">No classification results available</p>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[classification.label] || '#666';

  return (
    <div className="space-y-6">
      {/* Main Classification Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div
          className="p-6 text-white"
          style={{ backgroundColor: statusColor }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium uppercase tracking-wide">
                Health Classification
              </p>
              <h2 className="text-3xl font-bold mt-1">
                {formatStatus(classification.label)}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm">Confidence</p>
              <p className="text-4xl font-bold">
                {formatPercent(classification.confidence)}
              </p>
            </div>
          </div>
        </div>

        {/* Region Detection Warning */}
        {classification.region && !classification.region.in_training_distribution && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Geographic Limitation</p>
              <p className="text-xs text-amber-700 mt-1">
                Recording is from {classification.region.name}, which is outside the model&apos;s
                training distribution. Confidence has been reduced.
              </p>
            </div>
          </div>
        )}

        {/* Region Info */}
        {classification.region && (
          <div className="mx-6 mt-3 flex items-center text-sm text-gray-500">
            <Globe className="w-4 h-4 mr-1" />
            <span>Region: {classification.region.name}</span>
            {classification.region.confidence_adjusted && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Confidence adjusted
              </span>
            )}
          </div>
        )}

        {/* Animated Probability Distribution */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-reef-primary" />
              Most Similar Reference Sites
            </h3>

            {/* Mini Map showing similar sites */}
            <div className="mb-6">
              <MiniMap
                similarSites={similar_sites}
                highlightCount={3}
                className="rounded-lg overflow-hidden border border-gray-200"
              />
              <p className="text-xs text-gray-500 mt-2 text-center flex items-center justify-center">
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
                      isTopMatch
                        ? 'bg-gradient-to-r from-reef-light to-white border-2 border-reef-primary/20'
                        : 'bg-gray-50 hover:bg-gray-100'
                    )}
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
                        <p className={cn(
                          'font-medium text-gray-900',
                          isTopMatch && 'text-reef-primary'
                        )}>
                          {site.site_id}
                          {isTopMatch && (
                            <span className="ml-2 text-xs bg-reef-primary text-white px-2 py-0.5 rounded-full">
                              Best Match
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          {site.country} - {formatStatus(site.status)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        'text-lg font-semibold',
                        isTopMatch ? 'text-reef-primary' : 'text-gray-900'
                      )}>
                        {formatPercent(site.similarity)}
                      </p>
                      <p className="text-xs text-gray-500">similarity</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* More sites indicator */}
            {similar_sites.length > 5 && (
              <p className="text-sm text-gray-500 text-center mt-4">
                + {similar_sites.length - 5} more sites
              </p>
            )}
          </div>
        </div>
      )}

      {/* Caveats */}
      {caveats && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">{caveats}</p>
        </div>
      )}
    </div>
  );
}
