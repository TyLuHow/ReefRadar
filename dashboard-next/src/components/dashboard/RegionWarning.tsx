'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegionInfo } from '@/types';

interface RegionWarningProps {
  region: RegionInfo;
  className?: string;
}

export function RegionWarning({ region, className }: RegionWarningProps) {
  if (region.in_training_distribution) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/50 bg-amber-900/30 px-4 py-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-200">
            Out-of-Distribution Region Detected
          </p>
          <p className="text-sm text-amber-100/80 leading-relaxed">
            The detected region <strong>{region.name}</strong> ({region.detected})
            is outside the training distribution. Our models were trained primarily
            on Indo-Pacific reef data (Indonesia and Kenya).
          </p>
          {region.confidence_adjusted && (
            <p className="text-sm text-amber-100/80 leading-relaxed">
              Confidence scores have been reduced by 40% to account for the
              increased uncertainty in this region. Results should be interpreted
              with additional caution.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
