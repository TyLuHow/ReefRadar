'use client';

import { AudioCompare } from '@/components/audio/AudioCompare';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';
import { demoPair } from '@/lib/audio-manifest';

export default function ComparePage() {
  const pair = demoPair();
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #1a1714 0%, #0f0d0b 40%, #252220 100%)' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Page header */}
        <div className="text-center space-y-2">
          <h1
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: '#e5e1db' }}
          >
            Audio Comparison
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#a8a29e' }}>
            Two real coral reef recordings from the MARRS dataset, same
            location, same recorder-clock time of day. Use the crossfader to
            blend between them while watching their spectrograms in real time.
          </p>
        </div>

        {/* Full-size AudioCompare */}
        <AudioCompare compact={false} />

        {/* Explanation card */}
        <div
          className="rounded-xl p-6 space-y-3"
          style={{ background: '#252220', border: '1px solid rgba(229, 225, 219, 0.1)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: '#e5e1db' }}>
            What am I hearing?
          </h2>
          <div className="space-y-2 text-sm" style={{ color: '#a8a29e' }}>
            <p>
              <strong style={{ color: '#cd853f' }}>{pair.a.site_id}</strong>{' '}
              -- labelled &ldquo;{pair.a.label?.label_original}&rdquo; by MARRS:{' '}
              {pair.a.label?.label_definition}
            </p>
            <p>
              <strong style={{ color: '#c08081' }}>{pair.b.site_id}</strong>{' '}
              -- labelled &ldquo;{pair.b.label?.label_original}&rdquo; by MARRS:{' '}
              {pair.b.label?.label_definition}
            </p>
            <p>
              Both clips are unprocessed and not level-matched -- no gain or
              normalisation has been applied, so loudness differences may
              partly reflect recording conditions, not just reef condition.
            </p>
          </div>
        </div>

        {/* Caveats */}
        <CaveatsBanner defaultExpanded={false} />
      </div>
    </div>
  );
}
