'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { SampleGallery } from '@/components/gallery/SampleGallery';

const SpectrogramCanvas = dynamic(
  () => import('@/components/spectrogram/SpectrogramCanvas'),
  { ssr: false }
);

const VitalityDebugPanel = dynamic(
  () => import('@/components/dev/VitalityDebugPanel'),
  { ssr: false }
);

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-abyss">
      {/* Background spectrogram */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <SpectrogramCanvas state="idle" opacity={0.08} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero */}
        <header className="flex flex-col items-center pt-16 pb-12 px-4">
          <h1 className="hero-text text-bone text-center mb-3">ReefRadar</h1>
          <p
            className="text-sm tracking-wide text-center max-w-md"
            style={{ color: 'var(--text-secondary)' }}
          >
            Listen to the invisible reef. Explore real underwater recordings, hear the
            difference between healthy and degraded ecosystems, and analyze reef health
            with AI.
          </p>

          {/* Quick nav */}
          <div className="flex items-center gap-6 mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Link href="/experience" className="hover:text-bone transition-colors">
              Skip to analyzer
            </Link>
            <Link href="/dashboard/map" className="hover:text-bone transition-colors">
              Explore 54 sites
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

      {process.env.NODE_ENV === 'development' && <VitalityDebugPanel />}
    </div>
  );
}
