'use client';

import Link from 'next/link';
import { useLegacySitesResponse } from '@/features/contract';
import { deriveSiteStats } from '@/lib/site-stats';
import { SampleGallery } from '@/components/gallery/SampleGallery';

export default function LandingPage() {
  const { data: sitesData } = useLegacySitesResponse();
  const stats = deriveSiteStats(sitesData);

  return (
    <div className="relative min-h-screen bg-abyss">
      {/* Content */}
      <div className="relative z-10">
        {/* Hero */}
        <header className="flex flex-col items-center pt-16 pb-12 px-4">
          <h1 className="hero-text text-bone text-center mb-3">ReefRadar</h1>
          <p
            className="text-sm tracking-wide text-center max-w-md"
            style={{ color: 'var(--text-secondary)' }}
          >
            Listen to real underwater recordings from reference reefs labelled by the
            researchers who recorded them, compare sites recorded at the same location,
            and see which reference recordings your own recording most resembles.
          </p>

          {/* Quick nav */}
          <div className="flex items-center gap-6 mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Link href="/experience" className="hover:text-bone transition-colors">
              Skip to analyzer
            </Link>
            <Link href="/dashboard/map" className="hover:text-bone transition-colors">
              Explore the reference sites{sitesData ? ` (${stats.total})` : ' (—)'}
            </Link>
            <Link href="/about" className="hover:text-bone transition-colors">
              About
            </Link>
          </div>
        </header>

        {/* Gallery */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
          <SampleGallery />
        </main>
      </div>
    </div>
  );
}
