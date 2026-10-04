'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import modelCard from '@/data/model-card.json';

// D-12 (TRUTH-07): caveats name what the classifier was actually trained
// on (from model-card.json), not the broader reference-site countries, and
// never claim a confidence reduction.
const TRAINING_CAVEAT = `A small exploratory classifier (model ${modelCard.model_version}) trained on ${modelCard.training_rows} five-second windows from ${modelCard.training_sites_count} sites in ${modelCard.training_countries.join(', ')}; not validated on other sites or regions.`;

const CAVEATS = [
  TRAINING_CAVEAT,
  modelCard.evaluation_note,
  'Classification is based on acoustic similarity to reference recordings. Not a species identification or a definitive health diagnosis.',
  'Passive acoustic monitoring complements but does not replace visual surveys.',
  'Single audio recordings provide a snapshot. Reef health assessment requires temporal monitoring.',
];

interface CaveatsBannerProps {
  className?: string;
  defaultExpanded?: boolean;
}

export function CaveatsBanner({
  className,
  defaultExpanded = true,
}: CaveatsBannerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/50 bg-amber-900/30',
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-200">
            Scientific Caveats
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-amber-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <ol className="space-y-2 list-decimal list-inside">
            {CAVEATS.map((caveat, index) => (
              <li
                key={index}
                className="text-sm text-amber-100/80 leading-relaxed"
              >
                {caveat}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
