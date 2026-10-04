'use client';

import { AlertTriangle, Info } from 'lucide-react';
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

  // Near the training sites: a softer informational note instead of nothing,
  // so the absence of a warning is never read as validation (REVIEW WR-07).
  if (inTrainingRegion) {
    const nearest = region.nearest_training_site_km;
    const radius = region.training_radius_km;
    return (
      <div
        className={cn(
          'rounded-lg border border-sky-500/30 bg-sky-900/20 px-4 py-3',
          className
        )}
        role="note"
      >
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-sky-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-sky-200">Near the Classifier{"'"}s Training Sites</p>
            <p className="text-sm text-sky-100/80 leading-relaxed">
              This recording{"'"}s coordinates are
              {typeof radius === 'number' ? ` within ${radius} km of` : ' close to'} at least
              one of the classifier{"'"}s training sites
              {typeof nearest === 'number' ? ` (nearest about ${nearest} km away)` : ''}, all in{' '}
              {TRAINING_COUNTRIES_TEXT}. Being near training data is not
              validation: the model has not been tested on new sites, and the
              probabilities shown are its raw output.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/50 bg-amber-900/30 px-4 py-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
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
                The detected region <strong>{region.name}</strong>: no
                training site is close to this location
                {typeof region.nearest_training_site_km === 'number'
                  ? ` (the nearest is about ${Math.round(region.nearest_training_site_km).toLocaleString('en-US')} km away)`
                  : ''}
                . The classifier was trained only on recordings from{' '}
                {TRAINING_COUNTRIES_TEXT}. The probabilities shown are the
                model{"'"}s raw output, unmodified for this geographic
                mismatch -- results should be interpreted with additional
                caution.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
