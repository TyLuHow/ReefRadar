'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface DemoAudioReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyserNode: AnalyserNode | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  handlePlayPause: () => Promise<void>;
  crossfade: number;
  setCrossfade: (v: number) => void;
}

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

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [crossfade, setCrossfadeState] = useState(0);

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

      const hGain = ctx.createGain();
      hGain.gain.value = 1;
      healthyGainRef.current = hGain;

      const dGain = ctx.createGain();
      dGain.gain.value = 0;
      degradedGainRef.current = dGain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      hGain.connect(analyser);
      dGain.connect(analyser);
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
    if (healthyGainRef.current) healthyGainRef.current.gain.value = Math.cos(angle);
    if (degradedGainRef.current) degradedGainRef.current.gain.value = Math.sin(angle);
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

  return {
    isPlaying,
    currentTime,
    duration,
    analyserNode,
    loadState,
    handlePlayPause,
    crossfade,
    setCrossfade,
  };
}
