// recovered from the deployed bundle
// https://dashboard-next-indol-nu.vercel.app/_next/static/chunks/app/page-2432347ba7caadef.js
// (module 63181) on 2026-10-01 per D-02, no source map published.
// Cross-checked against a live GET /samples call (byte-identical sample fields and groupings).
import type { Sample, SampleStory } from '@/types';

export const FALLBACK_SAMPLES: Sample[] = [
  {
    id: 'idn_healthy_dawn', site_id: 'ind_H1', name: 'Dawn Chorus, Sulawesi',
    country: 'Indonesia', country_code: 'IDN', category: 'healthy',
    description: 'A thriving reef at sunrise — fish calls, snapping shrimp, and parrotfish grazing.',
    duration_seconds: 30, audio_url: '/audio/healthy-reef.wav',
    frequency_highlights: ['Fish chorus (200–2000 Hz)', 'Snapping shrimp (2–20 kHz)'],
    coordinates: { lat: -4.9216, lng: 119.316922 },
  },
  {
    id: 'aus_degraded_reef', site_id: 'aus_D1', name: 'Silent Reef, Great Barrier Reef',
    country: 'Australia', country_code: 'AUS', category: 'degraded',
    description: 'A bleached reef — sparse clicks, almost no fish chorus. The sound of absence.',
    duration_seconds: 30, audio_url: '/audio/degraded-reef.wav',
    frequency_highlights: ['Sparse clicks (2–5 kHz)', 'Background noise dominates'],
    coordinates: { lat: -16.84732, lng: 146.22907 },
  },
  {
    id: 'idn_restored_mid', site_id: 'ind_R1', name: 'Reef Restoration Site, Sulawesi',
    country: 'Indonesia', country_code: 'IDN', category: 'restored_mid',
    description: 'Two years into restoration — fish are returning, shrimp populations rebuilding.',
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Emerging fish calls (500–1500 Hz)', 'Growing shrimp activity'],
    coordinates: { lat: -4.922214, lng: 119.317036 },
  },
  {
    id: 'aus_healthy_gbr', site_id: 'aus_H1', name: 'Healthy Reef, Great Barrier Reef',
    country: 'Australia', country_code: 'AUS', category: 'healthy',
    description: "Dense acoustic landscape on Australia's iconic reef — constant biological activity.",
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Fish chorus (200–2000 Hz)', 'Reef invertebrates (3–15 kHz)'],
    coordinates: { lat: -16.84761, lng: 146.22839 },
  },
  {
    id: 'aus_restored_reef', site_id: 'aus_R1', name: 'Restored Reef, Great Barrier Reef',
    country: 'Australia', country_code: 'AUS', category: 'restored_early',
    // NOTE: category here is "restored_early" but live /sites reports aus_R1 as "restored_mid" — TRUTH-04 target.
    description: 'Early-stage recovery — the first signs of biological sound returning.',
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Pioneer species calls', 'Increasing low-frequency activity'],
    coordinates: { lat: -16.84719, lng: 146.22866 },
  },
  {
    id: 'mex_restored_carib', site_id: 'mex_R1', name: 'Restored Reef, Caribbean Mexico',
    country: 'Mexico', country_code: 'MEX', category: 'restored_mid',
    description: 'Caribbean restoration project — damselfish territorial calls beginning to dominate.',
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Damselfish calls (300–1200 Hz)', 'Urchin grazing sounds'],
    coordinates: { lat: 18.34107, lng: -87.807348 },
  },
  {
    id: 'phl_degraded_reef', site_id: 'phl_D1', name: 'Degraded Reef, Philippines',
    country: 'Philippines', country_code: 'PHL', category: 'degraded',
    // NOTE: phl_D1 confirmed absent from both live /sites (54 sites, no Philippines) and the
    // live MARRS figshare file listing (no phl_* zip exists) — TRUTH-04 requires deleting this entry.
    description: 'Overfished reef in the Coral Triangle — wave noise with very little biology.',
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Dominant wave noise (<500 Hz)', 'Minimal biotic sound'],
    coordinates: { lat: 9.85, lng: 124.02 },
  },
  {
    id: 'aus_healthy_outer', site_id: 'aus_H2', name: 'Outer Reef, Great Barrier Reef',
    country: 'Australia', country_code: 'AUS', category: 'healthy',
    description: 'Outer reef wall alive with sound — grouper booms and clownfish chirps.',
    duration_seconds: 30, audio_url: '',
    frequency_highlights: ['Grouper booms (100–400 Hz)', 'Clownfish chirps (600–1500 Hz)'],
    coordinates: { lat: -16.84782, lng: 146.22798 },
  },
];

export const SAMPLE_STORIES: Record<string, SampleStory> = {
  healthy_vs_degraded: {
    title: 'The Sound of Health',
    subtitle: 'Hear the difference between a thriving reef and a silent one',
    sample_ids: ['idn_healthy_dawn', 'aus_degraded_reef'],
  },
  restoration_timeline: {
    title: 'Recovery in Sound',
    subtitle: "How a reef's voice returns after restoration",
    sample_ids: ['aus_degraded_reef', 'aus_restored_reef', 'idn_restored_mid', 'idn_healthy_dawn'],
  },
  geographic_diversity: {
    title: 'Reefs Around the World',
    subtitle: 'Every reef has its own acoustic signature',
    sample_ids: ['idn_healthy_dawn', 'aus_healthy_gbr', 'mex_restored_carib', 'phl_degraded_reef'],
  },
};
