'use client';

import Link from 'next/link';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { STATUS_COLORS } from '@/types';
import type { AnalysisResult, ReefStatus } from '@/types';
import { formatStatus } from '@/lib/utils';

interface ComparisonPanelProps {
  analysisData: AnalysisResult;
}

const CATEGORY_ORDER: ReefStatus[] = ['healthy', 'degraded', 'restored_early', 'restored_mid'];

const CATEGORY_LABELS: Record<ReefStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  restored_early: 'Restored (Early)',
  restored_mid: 'Restored (Mid)',
};

export function ComparisonPanel({ analysisData }: ComparisonPanelProps) {
  const classification = analysisData.classification;
  const similarSites = analysisData.similar_sites;
  const region = classification?.region;

  return (
    <GlassPanel className="p-6 space-y-6">
      {/* Similarity bars */}
      {classification?.probabilities && (
        <div className="space-y-3">
          <p className="mono">Health Similarity</p>
          {CATEGORY_ORDER.map((status) => {
            const value = classification.probabilities[status] ?? 0;
            const pct = (value * 100).toFixed(1);
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
              background: region.in_training_distribution
                ? 'rgba(205, 133, 63, 0.1)'
                : 'rgba(184, 134, 11, 0.1)',
              borderLeft: `3px solid ${
                region.in_training_distribution ? '#cd853f' : '#b8860b'
              }`,
            }}
          >
            <p className="font-medium text-bone">{region.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {region.in_training_distribution
                ? 'Within training distribution -- full confidence'
                : 'Outside training distribution -- confidence adjusted'}
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
