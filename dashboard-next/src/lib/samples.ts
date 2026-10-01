// Generated from dashboard-next/src/data/audio-manifest.json (gallery section) -- TRUTH-03/04
// (D-05/D-09, 01-18). FALLBACK_SAMPLES and SAMPLE_STORIES are derived at import time via
// samplesFromManifest() so the committed fallback list used when GET /samples fails can never
// drift from the same manifest the router bundles (01-12): same sites, same labels, same audio
// paths. Do not hand-edit entries here -- update data/audio-manifest.json (and its dashboard-next
// mirror, kept in sync by scripts/build_audio_consumers.py) instead.

import manifestData from '@/data/audio-manifest.json';
import type { Sample, SampleStory } from '@/types';

interface ManifestGallerySample {
  id: string;
  excerpt_id: string;
  site_id: string;
  name: string;
  country: string;
  country_code: string;
  category: Sample['category'];
  description: string;
  duration_seconds: number;
  audio_path: string;
  frequency_highlights: string[];
  coordinates: { lat: number; lng: number };
}

interface ManifestGalleryStory {
  title: string;
  subtitle: string;
  sample_ids: string[];
}

export interface AudioManifestGallerySection {
  gallery: {
    samples: ManifestGallerySample[];
    stories: Record<string, ManifestGalleryStory>;
  };
}

/**
 * Maps every manifest gallery sample to the Sample type the UI consumes.
 * audio_url is set from the manifest's own local url_path (audio_path) --
 * never a remote or synthetic URL -- and frequency_highlights is always
 * empty (D-09: editorial frequency-highlight chips are removed, not
 * replaced with a different fabricated claim).
 */
export function samplesFromManifest(manifest: AudioManifestGallerySection): Sample[] {
  return manifest.gallery.samples.map((s) => ({
    id: s.id,
    site_id: s.site_id,
    name: s.name,
    country: s.country,
    country_code: s.country_code,
    category: s.category,
    description: s.description,
    duration_seconds: s.duration_seconds,
    audio_url: s.audio_path,
    frequency_highlights: [],
    coordinates: s.coordinates,
  }));
}

const manifest = manifestData as unknown as AudioManifestGallerySection;

/**
 * Fallback samples shown when GET /samples fails -- generated from the same
 * committed manifest the router bundles, so the fallback can never list a
 * site absent from the reference dataset or carry a label out of sync with
 * the site record (aus_R1 is restored_mid, matching /sites).
 */
export const FALLBACK_SAMPLES: Sample[] = samplesFromManifest(manifest);

/** Stories shown on the landing gallery and fallback, unchanged from the manifest. */
export const SAMPLE_STORIES: Record<string, SampleStory> = manifest.gallery.stories;
