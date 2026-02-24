'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

type BandName = 'low' | 'mid' | 'high';

interface AudioPlaybackReturn {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
  activeBands: Set<BandName>;
  toggleBand: (band: BandName) => void;
  loadBuffer: (audioBuffer: AudioBuffer) => void;
}

export function useAudioPlayback(): AudioPlaybackReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Filter nodes for band isolation
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);
  const lowGainRef = useRef<GainNode | null>(null);
  const midGainRef = useRef<GainNode | null>(null);
  const highGainRef = useRef<GainNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeBands, setActiveBands] = useState<Set<BandName>>(
    () => new Set<BandName>(['low', 'mid', 'high'])
  );

  // Lazily create AudioContext on user interaction
  const getOrCreateContext = useCallback((): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    // Create analyser
    const node = ctx.createAnalyser();
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.8;
    analyserRef.current = node;
    setAnalyser(node);

    // Create master gain
    const master = ctx.createGain();
    master.gain.value = 1;
    gainRef.current = master;

    // Create band filters and gains
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 800;
    lowFilterRef.current = lowFilter;

    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = 2000;
    midFilter.Q.value = 1.5;
    midFilterRef.current = midFilter;

    const highFilter = ctx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.value = 3500;
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

    // Wire: filter -> bandGain -> masterGain -> analyser -> destination
    lowFilter.connect(lowGain);
    midFilter.connect(midGain);
    highFilter.connect(highGain);

    lowGain.connect(master);
    midGain.connect(master);
    highGain.connect(master);

    master.connect(node);
    node.connect(ctx.destination);

    return ctx;
  }, []);

  const loadBuffer = useCallback((audioBuffer: AudioBuffer) => {
    bufferRef.current = audioBuffer;
    setDuration(audioBuffer.duration);
  }, []);

  const startTicker = useCallback(() => {
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
      const buf = bufferRef.current;
      if (buf) {
        setCurrentTime(Math.min(elapsed, buf.duration));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTicker = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    const ctx = getOrCreateContext();
    const buf = bufferRef.current;
    if (!buf) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Stop any existing source
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    sourceRef.current = source;

    // Connect source to all three filter branches
    if (lowFilterRef.current) source.connect(lowFilterRef.current);
    if (midFilterRef.current) source.connect(midFilterRef.current);
    if (highFilterRef.current) source.connect(highFilterRef.current);

    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      offsetRef.current = 0;
      stopTicker();
    };

    startTimeRef.current = ctx.currentTime;
    source.start(0, offsetRef.current);
    setIsPlaying(true);
    startTicker();
  }, [getOrCreateContext, startTicker, stopTicker]);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Save current offset
    const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
    offsetRef.current = elapsed;

    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    setIsPlaying(false);
    stopTicker();
  }, [stopTicker]);

  const stop = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    offsetRef.current = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    stopTicker();
  }, [stopTicker]);

  const toggleBand = useCallback((band: BandName) => {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) {
        next.delete(band);
      } else {
        next.add(band);
      }

      // Update gain nodes
      const gainMap: Record<BandName, React.RefObject<GainNode | null>> = {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTicker();
      try {
        sourceRef.current?.stop();
      } catch {
        // noop
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, [stopTicker]);

  return {
    play,
    pause,
    stop,
    isPlaying,
    currentTime,
    duration,
    analyser,
    activeBands,
    toggleBand,
    loadBuffer,
  };
}
