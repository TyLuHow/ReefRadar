'use client';

import { RefObject, useEffect, useRef } from 'react';
import { useVitalityStore, BandEnergy } from '@/stores/vitality-store';

/**
 * Reef biology frequency band definitions (Hz).
 * Bands intentionally overlap (fish/grazing share 1-2kHz).
 */
const REEF_BANDS = {
  ambient: { lo: 0, hi: 200 },
  fish: { lo: 200, hi: 2000 },
  grazing: { lo: 1000, hi: 4000 },
  shrimp: { lo: 2000, hi: 20000 },
} as const;

/**
 * Compute RMS energy for a slice of byte frequency data.
 * Pure function, no allocation.
 */
function bandRMS(data: Uint8Array<ArrayBuffer>, start: number, end: number): number {
  if (end <= start) return 0;
  let sumSq = 0;
  for (let i = start; i < end; i++) {
    const v = data[i] / 255;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / (end - start));
}

/**
 * Reads FFT data from an existing AnalyserNode, computes 4-band RMS energy,
 * and writes to the vitality store at ~30fps.
 *
 * Does NOT create any new audio nodes -- reuses the AnalyserNode from useDemoAudio.
 * Uses getState() for store writes to avoid React re-renders.
 */
export function useAudioVisualBridge(
  analyserRef: RefObject<AnalyserNode | null>,
  audioCtxRef: RefObject<AudioContext | null>,
  isPlaying: boolean
): void {
  // Pre-allocate FFT data buffer once
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Cache bin boundaries to avoid recomputation each frame
  const binBoundsRef = useRef<{
    ambientEnd: number;
    fishStart: number;
    fishEnd: number;
    grazingStart: number;
    grazingEnd: number;
    shrimpStart: number;
    shrimpEnd: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  // Track isPlaying in a ref so the rAF loop sees the latest value
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;
    if (!analyser || !audioCtx) return;

    // Pre-allocate Uint8Array for frequency data
    if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    // Compute bin boundaries from runtime sample rate
    const hzPerBin = audioCtx.sampleRate / analyser.fftSize;
    const binCount = analyser.frequencyBinCount;
    const binForHz = (hz: number): number =>
      Math.min(Math.round(hz / hzPerBin), binCount - 1);

    // Clamp shrimp upper bound to Nyquist
    const nyquist = audioCtx.sampleRate / 2;
    const shrimpHi = Math.min(REEF_BANDS.shrimp.hi, nyquist);

    binBoundsRef.current = {
      ambientEnd: binForHz(REEF_BANDS.ambient.hi),
      fishStart: binForHz(REEF_BANDS.fish.lo),
      fishEnd: binForHz(REEF_BANDS.fish.hi),
      grazingStart: binForHz(REEF_BANDS.grazing.lo),
      grazingEnd: binForHz(REEF_BANDS.grazing.hi),
      shrimpStart: binForHz(REEF_BANDS.shrimp.lo),
      shrimpEnd: binForHz(shrimpHi),
    };

    frameCountRef.current = 0;

    function tick() {
      frameCountRef.current++;

      // Throttle to ~30fps: process every other frame
      if (frameCountRef.current % 2 === 0 && isPlayingRef.current) {
        const data = freqDataRef.current;
        const bounds = binBoundsRef.current;
        if (data && bounds && analyser) {
          analyser.getByteFrequencyData(data);

          const energy: BandEnergy = {
            ambient: bandRMS(data, 0, bounds.ambientEnd),
            fish: bandRMS(data, bounds.fishStart, bounds.fishEnd),
            grazing: bandRMS(data, bounds.grazingStart, bounds.grazingEnd),
            shrimp: bandRMS(data, bounds.shrimpStart, bounds.shrimpEnd),
          };

          useVitalityStore.getState().setBandEnergy(energy);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Reset band energy to zeros on unmount to prevent stale values
      useVitalityStore.getState().setBandEnergy({
        ambient: 0,
        fish: 0,
        grazing: 0,
        shrimp: 0,
      });
    };
  }, [analyserRef, audioCtxRef]);
}
