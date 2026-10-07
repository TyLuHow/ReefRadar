/**
 * useCompareFixture (C-WR-04): a clip that has decoded but whose contract site record has not arrived is
 * still loading. It must not draw a spectrogram without its caption (site, dataset, recorded time).
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: { sites: { data: unknown; error: unknown } } = { sites: { data: undefined, error: null } };

vi.mock('@/features/contract', () => ({ useReferenceSites: () => state.sites }));
vi.mock('@/features/instrument', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/instrument')>();
  return {
    ...original,
    useClipSpectrogram: () => ({
      status: 'ready',
      matrix: { sampleRate: 16000 },
      samples: new Float32Array(160),
      sampleRate: 16000,
      buffer: undefined,
    }),
  };
});

import { COMPARE_A, COMPARE_B, useCompareFixture } from '@/features/fixtures/parts/useCompareFixture';

describe('useCompareFixture loading gate', () => {
  beforeEach(() => {
    state.sites = { data: undefined, error: null };
  });

  it('shows loading rows, not captionless wells, until the contract sites have arrived', () => {
    const { result } = renderHook(() => useCompareFixture());
    expect(result.current.rows.map((row) => row.state)).toEqual(['loading', 'loading']);
    expect(result.current.ready).toBe(false);
  });

  it('draws both rows with their captions once the dataset names are known', () => {
    state.sites = {
      data: [
        { site_id: COMPARE_A.site_id, dataset_name: 'Dataset A' },
        { site_id: COMPARE_B.site_id, dataset_name: 'Dataset B' },
      ],
      error: null,
    };
    const { result } = renderHook(() => useCompareFixture());
    expect(result.current.rows.map((row) => row.state)).toEqual([undefined, undefined]);
    expect(result.current.rows.map((row) => row.caption?.dataset)).toEqual(['Dataset A', 'Dataset B']);
    expect(result.current.ready).toBe(true);
  });
});
