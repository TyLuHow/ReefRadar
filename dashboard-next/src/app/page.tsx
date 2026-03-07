'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { GlassPanel } from '@/components/ui/glass';

const SpectrogramCanvas = dynamic(
  () => import('@/components/spectrogram/SpectrogramCanvas'),
  { ssr: false }
);

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-abyss flex flex-col items-center justify-center px-4">
      {/* Background spectrogram */}
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="idle" opacity={0.15} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl">
        {/* Title */}
        <h1 className="hero-text text-bone text-center mb-3">ReefRadar</h1>
        <p className="text-sm tracking-wide mb-12 text-center" style={{ color: 'var(--text-secondary)' }}>
          Listen to the invisible reef
        </p>

        {/* Primary action cards */}
        <div className="flex flex-col sm:flex-row gap-4 w-full mb-4">
          <Link href="/experience?mode=demo" className="flex-1">
            <GlassPanel className="p-6 text-center hover:border-ochre/40 cursor-pointer group">
              <h2 className="text-lg font-light text-bone mb-1 group-hover:text-ochre">
                Explore Demo Reefs
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Listen to healthy and degraded reef recordings
              </p>
            </GlassPanel>
          </Link>
          <Link href="/experience?mode=upload" className="flex-1">
            <GlassPanel className="p-6 text-center hover:border-ochre/40 cursor-pointer group">
              <h2 className="text-lg font-light text-bone mb-1 group-hover:text-ochre">
                Upload Your Recording
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Classify a WAV file against 54 reference sites
              </p>
            </GlassPanel>
          </Link>
        </div>

        {/* Secondary card */}
        <Link href="/dashboard/map" className="w-full">
          <GlassPanel className="p-4 text-center hover:border-ochre/40 cursor-pointer group">
            <h2 className="text-sm font-light text-bone group-hover:text-ochre">
              Explore 54 Reference Sites
            </h2>
          </GlassPanel>
        </Link>

        {/* Footer row */}
        <div className="flex items-center gap-6 mt-10 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Link href="/about" className="hover:text-bone">About</Link>
          <Link href="/about" className="hover:text-bone">Methodology</Link>
          <span>54 sites across 7 countries</span>
        </div>
      </div>
    </div>
  );
}
