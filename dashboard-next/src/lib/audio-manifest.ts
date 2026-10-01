// Canonical audio-excerpt accessor (TRUTH-03/07/08, D-05/D-06/D-07, 01-17).
//
// Single typed read path over dashboard-next/src/data/audio-manifest.json --
// a byte-for-byte mirror of data/audio-manifest.json, generated and kept in
// sync by scripts/build_audio_consumers.py (--check fails CI on drift).
// Do not fetch or hardcode audio URLs elsewhere; import from this module.

import manifestData from '@/data/audio-manifest.json';
import { getCitation } from '@/lib/citations';

export interface AudioLabel {
  status: string;
  label_original: string;
  label_definition: string;
  label_assigned_by: string;
  label_source: string;
}

export interface AudioExcerpt {
  excerpt_id: string;
  site_id: string;
  url_path: string;
  source_file: string;
  source_zip: string;
  recorded_at_recorder_clock: string;
  time_of_day_recorder_clock: string;
  timezone: string;
  offset_s: number;
  duration_s: number;
  gain_db: number;
  normalized: boolean;
  sample_rate_hz: number;
  bits_per_sample: number;
  channels: number;
  bytes: number;
  sha256: string;
  label?: AudioLabel;
}

interface GallerySample {
  id: string;
  excerpt_id: string;
  site_id: string;
  country: string;
  country_code: string;
}

interface GalleryStory {
  title: string;
  subtitle: string;
  sample_ids: string[];
}

interface AudioManifest {
  schema_version: number;
  dataset: {
    citation_id: string;
    doi: string;
    figshare_article: number;
    licence: string;
  };
  excerpts: AudioExcerpt[];
  gallery: {
    samples: GallerySample[];
    stories: Record<string, GalleryStory>;
  };
}

const manifest = manifestData as unknown as AudioManifest;

const excerptsById = new Map<string, AudioExcerpt>(manifest.excerpts.map((e) => [e.excerpt_id, e]));
const sampleByExcerptId = new Map<string, GallerySample>(manifest.gallery.samples.map((s) => [s.excerpt_id, s]));

/** Look up a single excerpt by id. Throws if the id is unknown (fail loud, never fall back to synthetic). */
export function getExcerpt(excerptId: string): AudioExcerpt {
  const excerpt = excerptsById.get(excerptId);
  if (!excerpt) {
    throw new Error(`Unknown audio excerpt id: "${excerptId}". Known ids: ${Array.from(excerptsById.keys()).join(', ')}`);
  }
  return excerpt;
}

export interface DemoPair {
  a: AudioExcerpt;
  b: AudioExcerpt;
}

/**
 * The fixed healthy-vs-degraded demo pair (D-05): two same-location MARRS
 * excerpts recorded at the same recorder-clock time of day, per the
 * manifest's gallery.stories.healthy_vs_degraded story.
 */
export function demoPair(): DemoPair {
  const story = manifest.gallery.stories.healthy_vs_degraded;
  if (!story || story.sample_ids.length < 2) {
    throw new Error('Audio manifest is missing the healthy_vs_degraded gallery story');
  }
  const [aId, bId] = story.sample_ids;
  return { a: getExcerpt(aId), b: getExcerpt(bId) };
}

/**
 * Human-readable, fact-only caption for a single excerpt: site, region
 * (country), recorder-clock date/time (timezone unverified), and the
 * dataset's own label. No species, behaviour or fabricated claims (D-09).
 */
export function excerptCaption(excerpt: AudioExcerpt): string {
  const sample = sampleByExcerptId.get(excerpt.excerpt_id);
  const region = sample?.country ?? 'unknown region';
  const [date, time] = excerpt.recorded_at_recorder_clock.split('T');
  const hhmm = excerpt.time_of_day_recorder_clock || time.slice(0, 5);
  const labelOriginal = excerpt.label?.label_original ?? 'unlabelled';
  return `${excerpt.site_id}, ${region} — recorded ${date} ${hhmm} (recorder clock, timezone unverified) — label '${labelOriginal}' assigned by MARRS`;
}

/** Canonical MARRS short citation with DOI and licence (D-19/TRUTH-08). */
export function attributionLine(): string {
  const citation = getCitation(manifest.dataset.citation_id);
  return `${citation.short} — DOI: ${citation.doi} — ${citation.licence}`;
}

export interface CompareLocation {
  id: string;
  name: string;
  region: string;
  available: string[];
  excerpts: Record<string, AudioExcerpt>;
}

/**
 * Groups excerpts by site-id prefix (location) for any TS-side consumer
 * that needs the manifest's own view of "which real excerpts exist per
 * location" (D-08). The generated runtime artifact Location Compare
 * actually fetches is public/audio/compare/manifest.json
 * (scripts/build_audio_consumers.py, Task 3) -- this is a read-only mirror
 * of the same underlying facts for in-app use.
 */
export function compareLocations(): CompareLocation[] {
  const byLocation = new Map<string, CompareLocation>();
  for (const excerpt of manifest.excerpts) {
    if (!excerpt.label) continue;
    const locId = excerpt.site_id.split('_')[0];
    const sample = sampleByExcerptId.get(excerpt.excerpt_id);
    const region = sample?.country ?? 'unknown region';
    let loc = byLocation.get(locId);
    if (!loc) {
      loc = { id: locId, name: region, region, available: [], excerpts: {} };
      byLocation.set(locId, loc);
    }
    const status = excerpt.label.status;
    if (!loc.available.includes(status)) loc.available.push(status);
    loc.excerpts[status] = excerpt;
  }
  return Array.from(byLocation.values()).sort((a, b) => a.id.localeCompare(b.id));
}
