'use client';

// recovered from the deployed bundle
// https://dashboard-next-indol-nu.vercel.app/_next/static/chunks/app/page-2432347ba7caadef.js
// (the module containing the "Loading samples..." / "More Samples" strings) on 2026-10-01
// per D-02, no source map published. SampleCard.tsx itself was confirmed byte-identical to the
// already-committed git copy — only this component and the two lib/types files were missing.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { SampleCard } from './SampleCard';
import { api } from '@/lib/api';
import { FALLBACK_SAMPLES, SAMPLE_STORIES } from '@/lib/samples';
import type { Sample, SampleStory } from '@/types';

// 01-18: keys match data/audio-manifest.json's gallery.stories (restoration_ladder,
// not the pre-manifest "restoration_timeline" key).
const STORY_ORDER = ['healthy_vs_degraded', 'restoration_ladder', 'geographic_diversity'];

export function SampleGallery() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [stories, setStories] = useState<Record<string, SampleStory>>({});
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSamples();
        if (!cancelled) {
          setSamples(data.samples);
          setStories(data.stories);
        }
      } catch {
        if (!cancelled) {
          setSamples(FALLBACK_SAMPLES);
          setStories(SAMPLE_STORIES);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlay = useCallback((id: string) => setPlayingId(id), []);
  const handlePause = useCallback(() => setPlayingId(null), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading samples...
        </div>
      </div>
    );
  }

  const sampleById = new Map(samples.map((s) => [s.id, s]));
  const storiedIds = new Set(Object.values(stories).flatMap((story) => story.sample_ids));
  const moreSamples = samples.filter((s) => !storiedIds.has(s.id));

  return (
    <div className="space-y-16">
      {STORY_ORDER.map((key) => {
        const story = stories[key];
        if (!story) return null;
        const storySamples = story.sample_ids
          .map((id) => sampleById.get(id))
          .filter((s): s is Sample => !!s);
        if (storySamples.length === 0) return null;
        return (
          <section key={key}>
            <div className="mb-6">
              <h2 className="text-xl font-light text-bone mb-1">{story.title}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {story.subtitle}
              </p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory">
              {storySamples.map((sample) => (
                <div key={sample.id} className="snap-start">
                  <SampleCard
                    sample={sample}
                    playingId={playingId}
                    onPlay={handlePlay}
                    onPause={handlePause}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {moreSamples.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-light text-bone mb-1">More Samples</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Additional recordings from our reference library
            </p>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory">
            {moreSamples.map((sample) => (
              <div key={sample.id} className="snap-start">
                <SampleCard
                  sample={sample}
                  playingId={playingId}
                  onPlay={handlePlay}
                  onPause={handlePause}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-center pb-8">
        <Link
          href="/experience"
          className="text-xs hover:text-bone transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          Skip to analyzer →
        </Link>
      </div>
    </div>
  );
}
