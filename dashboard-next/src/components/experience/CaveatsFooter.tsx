'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  'Environmental noise, recording equipment, and time of day affect acoustic signatures.',
];

interface CaveatsFooterProps {
  className?: string;
}

export function CaveatsFooter({ className }: CaveatsFooterProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('w-full', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs w-full py-2"
        style={{ color: 'var(--text-muted)' }}
        aria-expanded={expanded}
      >
        <span className="font-medium">Scientific Caveats</span>
        {expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>

      {expanded && (
        <ol className="space-y-1.5 list-decimal list-inside pb-4">
          {CAVEATS.map((caveat, i) => (
            <li
              key={i}
              className="text-xs leading-relaxed"
              style={{ color: 'var(--text-dim)' }}
            >
              {caveat}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
