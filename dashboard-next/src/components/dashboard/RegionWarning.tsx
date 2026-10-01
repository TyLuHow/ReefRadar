'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegionInfo } from '@/types';
import modelCard from '@/data/model-card.json';

interface RegionWarningProps {
  region: RegionInfo;
  className?: string;
}

const TRAINING_COUNTRIES_TEXT = modelCard.training_countries.join(', ');

// D-12 (TRUTH-06/07): region status is a separate, honest note -- it never
// claims a probability was reduced or adjusted. `coordinates_provided` and
// `in_training_region` come from the 01-11 classifier contract; an older
// API response that predates that contract falls back to `detected ===
// 'UNKNOWN'` for "not provided" and the legacy `in_training_distribution`
// field for training coverage.
export function RegionWarning({ region, className }: RegionWarningProps) {
  const coordinatesProvided =
    region.coordinates_provided ?? region.detected !== 'UNKNOWN';
  const inTrainingRegion =
    region.in_training_region ?? region.in_training_distribution ?? false;

  if (inTrainingRegion) {
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
          {!coordinatesProvided ? (
            <>
              <p className="font-semibold text-amber-200">
                Location Not Provided
              </p>
              <p className="text-sm text-amber-100/80 leading-relaxed">
                No coordinates were given with this recording, so we cannot
                assess whether it falls within the classifier{"'"}s training
                region. The classifier was trained only on real recordings
                from {TRAINING_COUNTRIES_TEXT}.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-200">
                Outside the Classifier{"'"}s Training Region
              </p>
              <p className="text-sm text-amber-100/80 leading-relaxed">
                The detected region <strong>{region.name}</strong> has no
                real training sites behind this classifier. It was trained
                only on recordings from {TRAINING_COUNTRIES_TEXT}. The
                probabilities shown are the model{"'"}s raw output, unmodified
                for this geographic mismatch -- results should be
                interpreted with additional caution.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
