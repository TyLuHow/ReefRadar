import { describe, it, expect } from 'vitest';
import { FALLBACK_SAMPLES, SAMPLE_STORIES, samplesFromManifest, type AudioManifestGallerySection } from '@/lib/samples';
import sitesFixture from '../fixtures/api/sites.json';

describe('samples (01-18, TRUTH-03/04/09, D-05/D-09)', () => {
  const siteIds = new Set(sitesFixture.sites.map((s) => s.site_id));
  const siteStatusById = new Map(sitesFixture.sites.map((s) => [s.site_id, s.status]));

  it('FALLBACK_SAMPLES contains no site absent from the reference dataset and no phl_ site', () => {
    expect(FALLBACK_SAMPLES.length).toBeGreaterThan(0);
    for (const sample of FALLBACK_SAMPLES) {
      expect(siteIds.has(sample.site_id)).toBe(true);
      expect(sample.site_id.startsWith('phl_')).toBe(false);
      expect(sample.id).not.toContain('phl_D1');
    }
  });

  it('every FALLBACK_SAMPLES category matches the site fixture status (aus_R1 is restored_mid)', () => {
    for (const sample of FALLBACK_SAMPLES) {
      expect(sample.category).toBe(siteStatusById.get(sample.site_id));
    }
    const ausR1 = FALLBACK_SAMPLES.find((s) => s.site_id === 'aus_R1');
    expect(ausR1).toBeDefined();
    expect(ausR1!.category).toBe('restored_mid');
  });

  it('every FALLBACK_SAMPLES audio_url is non-empty, local, and under /audio/marrs/', () => {
    for (const sample of FALLBACK_SAMPLES) {
      expect(sample.audio_url).toBeTruthy();
      expect(sample.audio_url.startsWith('/audio/marrs/')).toBe(true);
    }
  });

  it('every FALLBACK_SAMPLES frequency_highlights array is empty', () => {
    for (const sample of FALLBACK_SAMPLES) {
      expect(sample.frequency_highlights).toEqual([]);
    }
  });

  it('SAMPLE_STORIES contains the three manifest stories and references only existing sample ids', () => {
    expect(Object.keys(SAMPLE_STORIES).sort()).toEqual(
      ['geographic_diversity', 'healthy_vs_degraded', 'restoration_ladder'].sort()
    );
    const sampleIds = new Set(FALLBACK_SAMPLES.map((s) => s.id));
    for (const story of Object.values(SAMPLE_STORIES)) {
      expect(story.sample_ids.length).toBeGreaterThan(0);
      for (const id of story.sample_ids) {
        expect(sampleIds.has(id)).toBe(true);
      }
    }
  });

  it('samplesFromManifest maps a gallery sample to the Sample type, zeroing frequency_highlights', () => {
    const manifest: AudioManifestGallerySection = {
      gallery: {
        samples: [
          {
            id: 'test_X1_20200101_120000',
            excerpt_id: 'test_X1_20200101_120000',
            site_id: 'test_X1',
            name: 'Test reef',
            country: 'Testland',
            country_code: 'TST',
            category: 'healthy',
            description: 'test_X1: labelled "Healthy (H)" by MARRS.',
            duration_seconds: 30,
            audio_path: '/audio/marrs/test_X1_20200101_120000.wav',
            frequency_highlights: ['should be dropped (200-2000 Hz)'],
            coordinates: { lat: 1, lng: 2 },
          },
        ],
        stories: {},
      },
    };
    const [sample] = samplesFromManifest(manifest);
    expect(sample).toEqual({
      id: 'test_X1_20200101_120000',
      site_id: 'test_X1',
      name: 'Test reef',
      country: 'Testland',
      country_code: 'TST',
      category: 'healthy',
      description: 'test_X1: labelled "Healthy (H)" by MARRS.',
      duration_seconds: 30,
      audio_url: '/audio/marrs/test_X1_20200101_120000.wav',
      frequency_highlights: [],
      coordinates: { lat: 1, lng: 2 },
    });
  });
});
