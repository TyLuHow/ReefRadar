'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Footer() {
  const pathname = usePathname();
  // Dark theme on all pages
  const isDark = true;

  return (
    <footer
      className={cn(
        'py-6 mt-auto border-t',
        isDark
          ? 'border-white/5 bg-abyss'
          : 'border-gray-200 bg-white',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p
          className={cn(
            'text-center text-sm',
            isDark ? 'text-white/30' : 'text-gray-500',
          )}
        >
          ReefRadar {"\u2014"} Coral Reef Acoustic Health Analysis
        </p>
      </div>
    </footer>
  );
}
