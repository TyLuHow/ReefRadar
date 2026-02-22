'use client';

import { AudioCompare } from '@/components/audio/AudioCompare';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';

export default function ComparePage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #030b1a 0%, #061428 40%, #0a2240 100%)' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Page header */}
        <div className="text-center space-y-2">
          <h1
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: '#e0f0ff' }}
          >
            Audio Comparison
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#6b8aad' }}>
            Hear the difference between a thriving reef and a degraded one.
            Use the crossfader to blend between synthesised healthy and
            degraded coral reef soundscapes while watching their spectrograms
            in real time.
          </p>
        </div>

        {/* Full-size AudioCompare */}
        <AudioCompare compact={false} />

        {/* Explanation card */}
        <div
          className="rounded-xl p-6 space-y-3"
          style={{ background: '#0a2240', border: '1px solid #0d3b6640' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: '#e0f0ff' }}>
            What am I hearing?
          </h2>
          <div className="space-y-2 text-sm" style={{ color: '#6b8aad' }}>
            <p>
              <strong style={{ color: '#00ffa3' }}>Healthy reefs</strong> are
              acoustically rich. Snapping shrimp produce continuous broadband
              crackles (2-16 kHz), fish produce low-frequency grunts and calls
              (200-800 Hz), and the overall sound level is markedly higher than
              degraded sites.
            </p>
            <p>
              <strong style={{ color: '#ff6b6b' }}>Degraded reefs</strong> are
              strikingly quiet. With fewer organisms present, the soundscape is
              dominated by abiotic noise -- distant boat traffic, wave action,
              and low-frequency rumble. The absence of biological sound is
              itself a diagnostic signal.
            </p>
            <p>
              The SurfPerch ML model used by ReefRadar converts these acoustic
              differences into 1280-dimensional embeddings that can be compared
              quantitatively to reference sites of known health status.
            </p>
          </div>
        </div>

        {/* Caveats */}
        <CaveatsBanner defaultExpanded={false} />
      </div>
    </div>
  );
}
