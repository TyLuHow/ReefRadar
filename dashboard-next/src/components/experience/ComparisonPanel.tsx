'use client';

import Link from 'next/link';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { STATUS_COLORS } from '@/types';
import type { AnalysisResult, ReefStatus } from '@/types';
import { formatStatus } from '@/lib/utils';
import { toIntegerPercentages, presentClasses } from '@/lib/probabilities';

interface ComparisonPanelProps {
  analysisData: AnalysisResult;
}

const CANONICAL_STATUS_ORDER: readonly ReefStatus[] = [
  'healthy',
  'degraded',
  'restored_early',
  'restored_mid',
];

const CATEGORY_LABELS: Record<ReefStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  restored_early: 'Restored (Early)',
  restored_mid: 'Restored (Mid)',
  unknown: 'Unknown',
};

function labelSourceName(labelSource: string): string {
  switch (labelSource) {
    case 'marrs':
      return 'MARRS';
    case 'coralsoundexplorer':
      return 'CoralSoundExplorer';
    default:
      return labelSource;
  }
}

export function ComparisonPanel({ analysisData }: ComparisonPanelProps) {
  const classification = analysisData.classification;
  const similarSites = analysisData.similar_sites;
  const region = classification?.region;
  const inTrainingRegion = region
    ? region.in_training_region ?? region.in_training_distribution ?? false
    : false;

  const classes = presentClasses(classification?.probabilities, CANONICAL_STATUS_ORDER);
  const integerPercentages: Partial<Record<ReefStatus, number>> = classification?.probabilities
    ? toIntegerPercentages(classification.probabilities)
    : {};

  return (
    <GlassPanel className="p-6 space-y-6">
      {/* Class probabilities */}
      {classification?.probabilities && (
        <div className="space-y-3">
          <p className="mono">Class probabilities (model output)</p>
          {classes.map((status) => {
            const value = classification.probabilities[status] ?? 0;
            const pct = integerPercentages[status] ?? 0;
            const color = STATUS_COLORS[status];
            return (
              <div key={status} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {CATEGORY_LABELS[status]}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full" style={{ background: 'var(--glass-bg)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${value * 100}%`,
                      backgroundColor: color,
                      minWidth: value > 0 ? '2px' : '0',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Region detection info */}
      {region && (
        <div className="space-y-2">
          <p className="mono">Region Detection</p>
          <div
            className="text-sm rounded-lg p-3"
            style={{
              background: inTrainingRegion
                ? 'rgba(205, 133, 63, 0.1)'
                : 'rgba(184, 134, 11, 0.1)',
              borderLeft: `3px solid ${inTrainingRegion ? '#cd853f' : '#b8860b'}`,
            }}
          >
            <p className="font-medium text-bone">{region.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {inTrainingRegion
                ? 'The classifier has real training sites in this region'
                : 'The classifier has no training sites in this region -- probabilities are unmodified'}
            </p>
          </div>
        </div>
      )}

      {/* Top 3 similar sites */}
      {similarSites && similarSites.length > 0 && (
        <div className="space-y-2">
          <p className="mono">Most Similar Sites</p>
          {similarSites.slice(0, 3).map((site) => (
            <div
              key={site.site_id}
              className="flex items-center justify-between text-sm py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[site.status] }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {site.site_id}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {site.country}
                </span>
                {site.label_source && site.label_original && (
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    label: {site.label_original} ({labelSourceName(site.label_source)})
                  </span>
                )}
              </div>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {(site.similarity * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Caveats note */}
      {classification && analysisData.caveats && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          {analysisData.caveats}
        </p>
      )}

      {/* View Map button */}
      <GlassButton href="/dashboard/map" className="w-full">
        View on Map
      </GlassButton>
    </GlassPanel>
  );
}
