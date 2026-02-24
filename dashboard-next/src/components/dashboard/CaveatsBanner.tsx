'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const CAVEATS = [
  'Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis.',
  'Passive acoustic monitoring complements but does not replace visual surveys.',
  'Models trained primarily on Indo-Pacific reefs (Indonesia, Australia, Kenya, Maldives, Mexico). Results for Caribbean, Red Sea, and other regions carry reduced confidence.',
  'Single audio recordings provide a snapshot. Reef health assessment requires temporal monitoring.',
  'Acoustic indices developed for terrestrial environments perform inconsistently underwater.',
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
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
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
