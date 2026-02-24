'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const CAVEATS = [
  'Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis.',
  'Passive acoustic monitoring complements but does not replace visual surveys.',
  'Model trained on Indo-Pacific reefs (Indonesia, Australia, Kenya, Maldives, Mexico). Results for other regions carry lower confidence.',
  'Confidence scores reflect acoustic similarity, not absolute reef health measurements.',
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
