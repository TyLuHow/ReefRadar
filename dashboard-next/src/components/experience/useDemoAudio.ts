'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { BandId } from '@/components/spectrogram/FrequencyBands';
import { ALL_BANDS } from '@/components/spectrogram/FrequencyBands';
import { useAudioVisualBridge } from '@/hooks/useAudioVisualBridge';
import { useVitalityStore, ReefBandId } from '@/stores/vitality-store';

interface DemoAudioReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyserNode: AnalyserNode | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  handlePlayPause: () => Promise<void>;
  crossfade: number;
  setCrossfade: (v: number) => void;
  activeBands: Set<BandId>;
  toggleBand: (band: BandId) => void;
}

/**
 * Filter cutoff frequencies based on AUDIO_DIAGNOSIS.md recommendations
 * for 16 kHz source files (8 kHz Nyquist).
 *
 *   Low  (Fish Calls):      lowpass  at 800 Hz
 *   Mid  (Grazing):         bandpass at 2000 Hz, Q = 1.5
 *   High (Snapping Shrimp): highpass at 3500 Hz
 */
const FILTER_LOW_FREQ = 800;
const FILTER_MID_FREQ = 2000;
const FILTER_MID_Q = 1.5;
const FILTER_HIGH_FREQ = 3500;

export function useDemoAudio(): DemoAudioReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const healthyBufRef = useRef<AudioBuffer | null>(null);
  const degradedBufRef = useRef<AudioBuffer | null>(null);
  const healthySourceRef = useRef<AudioBufferSourceNode | null>(null);
  const degradedSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const healthyGainRef = useRef<GainNode | null>(null);
  const degradedGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingPlayRef = useRef(false);

  // Filter nodes -- parallel branches for each frequency band
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);

  // Per-band gain nodes (0 = muted, 1 = active)
  const lowGainRef = useRef<GainNode | null>(null);
  const midGainRef = useRef<GainNode | null>(null);
  const highGainRef = useRef<GainNode | null>(null);

  // Merger node to sum filtered branches before analyser
  const mergerGainRef = useRef<GainNode | null>(null);

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [crossfade, setCrossfadeState] = useState(0);
  const [activeBands, setActiveBands] = useState<Set<BandId>>(() => new Set(ALL_BANDS));

  const initAudio = useCallback(async () => {
    if (loadState !== 'idle') return;
    setLoadState('loading');
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const [hRes, dRes] = await Promise.all([
        fetch('/audio/healthy-reef.wav'),
        fetch('/audio/degraded-reef.wav'),
      ]);
      if (!hRes.ok || !dRes.ok) throw new Error('Failed to load audio');

      const [hBuf, dBuf] = await Promise.all([
        ctx.decodeAudioData(await hRes.arrayBuffer()),
        ctx.decodeAudioData(await dRes.arrayBuffer()),
      ]);
      healthyBufRef.current = hBuf;
      degradedBufRef.current = dBuf;
      setDuration(hBuf.duration);

      // --- Crossfade gain nodes (healthy vs degraded) ---
      const hGain = ctx.createGain();
      hGain.gain.value = 1;
      healthyGainRef.current = hGain;

      const dGain = ctx.createGain();
      dGain.gain.value = 0;
      degradedGainRef.current = dGain;

      // --- Merger: both crossfade gains feed into this node ---
      const merger = ctx.createGain();
      merger.gain.value = 1;
      mergerGainRef.current = merger;

      hGain.connect(merger);
      dGain.connect(merger);

      // --- Parallel filter bank ---
      // Each filter branch: merger -> filter -> bandGain -> analyser -> destination
      //
      //                   +--> lowFilter  --> lowGain  --+
      //   merger -------->+--> midFilter  --> midGain  --+--> analyser --> destination
      //                   +--> highFilter --> highGain --+

      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = FILTER_LOW_FREQ;
      lowFilterRef.current = lowFilter;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.value = FILTER_MID_FREQ;
      midFilter.Q.value = FILTER_MID_Q;
      midFilterRef.current = midFilter;

      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'highpass';
      highFilter.frequency.value = FILTER_HIGH_FREQ;
      highFilterRef.current = highFilter;

      const lowGain = ctx.createGain();
      lowGain.gain.value = 1;
      lowGainRef.current = lowGain;

      const midGain = ctx.createGain();
      midGain.gain.value = 1;
      midGainRef.current = midGain;

      const highGain = ctx.createGain();
      highGain.gain.value = 1;
      highGainRef.current = highGain;

      // Wire filters
      merger.connect(lowFilter);
      merger.connect(midFilter);
      merger.connect(highFilter);

      lowFilter.connect(lowGain);
      midFilter.connect(midGain);
      highFilter.connect(highGain);

      // Analyser node
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      // All band gains merge into the analyser
      lowGain.connect(analyser);
      midGain.connect(analyser);
      highGain.connect(analyser);

      analyser.connect(ctx.destination);

      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [loadState]);

  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const hBuf = healthyBufRef.current;
    const dBuf = degradedBufRef.current;
    const hGain = healthyGainRef.current;
    const dGain = degradedGainRef.current;
    if (!ctx || !hBuf || !dBuf || !hGain || !dGain) return;

    if (ctx.state === 'suspended') ctx.resume();

    const hSource = ctx.createBufferSource();
    hSource.buffer = hBuf;
    hSource.connect(hGain);
    const dSource = ctx.createBufferSource();
    dSource.buffer = dBuf;
    dSource.connect(dGain);

    healthySourceRef.current = hSource;
    degradedSourceRef.current = dSource;

    // Loop both sources so audio restarts seamlessly
    hSource.loop = true;
    dSource.loop = true;

    startTimeRef.current = ctx.currentTime;
    hSource.start(0);
    dSource.start(0);
    setIsPlaying(true);

    const tick = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      // Wrap current time for looping display
      setCurrentTime(elapsed % hBuf.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPlayback = useCallback(() => {
    try { healthySourceRef.current?.stop(); } catch { /* noop */ }
    try { degradedSourceRef.current?.stop(); } catch { /* noop */ }
    healthySourceRef.current = null;
    degradedSourceRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (loadState === 'idle') {
      pendingPlayRef.current = true;
      await initAudio();
      return;
    }
    if (loadState !== 'ready') return;
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [loadState, isPlaying, initAudio, startPlayback, stopPlayback]);

  useEffect(() => {
    if (loadState === 'ready' && pendingPlayRef.current) {
      pendingPlayRef.current = false;
      startPlayback();
    }
  }, [loadState, startPlayback]);

  const setCrossfade = useCallback((v: number) => {
    setCrossfadeState(v);
    // Equal-power crossfade: avoids volume dip at 50%
    const angle = v * Math.PI / 2;
    if (healthyGainRef.current) {
      healthyGainRef.current.gain.setValueAtTime(
        Math.cos(angle),
        audioCtxRef.current?.currentTime ?? 0
      );
    }
    if (degradedGainRef.current) {
      degradedGainRef.current.gain.setValueAtTime(
        Math.sin(angle),
        audioCtxRef.current?.currentTime ?? 0
      );
    }
  }, []);

  const toggleBand = useCallback((band: BandId) => {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);

      // Map band IDs to their gain node refs
      const gainMap: Record<BandId, React.RefObject<GainNode | null>> = {
        low: lowGainRef,
        mid: midGainRef,
        high: highGainRef,
      };

      const gainNode = gainMap[band].current;
      const ctx = audioCtxRef.current;
      if (gainNode && ctx) {
        // Click-free switching via setValueAtTime
        gainNode.gain.setValueAtTime(next.has(band) ? 1 : 0, ctx.currentTime);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try { healthySourceRef.current?.stop(); } catch { /* noop */ }
      try { degradedSourceRef.current?.stop(); } catch { /* noop */ }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Audio-visual bridge: extract 4-band RMS energy at ~30fps and write to store
  useAudioVisualBridge(analyserRef, audioCtxRef, isPlaying);

  // Sync 3-band audio toggles (low/mid/high) to 4-band reef biology (ambient/fish/grazing/shrimp)
  useEffect(() => {
    const reefBands = new Set<ReefBandId>();
    if (activeBands.has('low')) {
      reefBands.add('ambient');
      reefBands.add('fish');
    }
    if (activeBands.has('mid')) {
      reefBands.add('grazing');
    }
    if (activeBands.has('high')) {
      reefBands.add('shrimp');
    }
    useVitalityStore.getState().setActiveBands(reefBands);
  }, [activeBands]);

  return {
    isPlaying,
    currentTime,
    duration,
    analyserNode,
    loadState,
    handlePlayPause,
    crossfade,
    setCrossfade,
    activeBands,
    toggleBand,
  };
}
