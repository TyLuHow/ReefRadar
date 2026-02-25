'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { BandId } from '@/components/spectrogram/FrequencyBands';
import { ALL_BANDS } from '@/components/spectrogram/FrequencyBands';

// --- Types -------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'degraded' | 'restored_early' | 'restored_mid';

export interface LocationInfo {
  id: string;
  name: string;
  region: string;
  coordinates: { lat: number; lon: number };
  available: HealthStatus[];
  files: Partial<Record<HealthStatus, string>>;
  description: string;
}

interface Manifest {
  locations: LocationInfo[];
}

export interface LocationAudioReturn {
  // Existing fields from useDemoAudio
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
  // New location fields
  locations: LocationInfo[];
  selectedLocation: LocationInfo | null;
  setSelectedLocation: (id: string) => void;
  leftTrack: HealthStatus;
  rightTrack: HealthStatus;
  setLeftTrack: (s: HealthStatus) => void;
  setRightTrack: (s: HealthStatus) => void;
}

// --- Filter constants (same as useDemoAudio) ---------------------------------

const FILTER_LOW_FREQ = 800;
const FILTER_MID_FREQ = 2000;
const FILTER_MID_Q = 1.5;
const FILTER_HIGH_FREQ = 3500;

// --- Hook implementation -----------------------------------------------------

export function useLocationAudio(): LocationAudioReturn {
  // Manifest state
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [selectedLocation, setSelectedLocationState] = useState<LocationInfo | null>(null);
  const [leftTrack, setLeftTrackState] = useState<HealthStatus>('healthy');
  const [rightTrack, setRightTrackState] = useState<HealthStatus>('degraded');

  // Audio context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const leftBufRef = useRef<AudioBuffer | null>(null);
  const rightBufRef = useRef<AudioBuffer | null>(null);
  const leftSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rightSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const leftGainRef = useRef<GainNode | null>(null);
  const rightGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

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

  // Track audio graph is built
  const graphBuiltRef = useRef(false);

  // State
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [crossfade, setCrossfadeState] = useState(0);
  const [activeBands, setActiveBands] = useState<Set<BandId>>(() => new Set(ALL_BANDS));

  // Track current crossfade value for restoring after track swap
  const crossfadeRef = useRef(0);
  const activeBandsRef = useRef<Set<BandId>>(new Set(ALL_BANDS));

  // --- Fetch manifest on mount -----------------------------------------------

  useEffect(() => {
    let cancelled = false;
    fetch('/audio/compare/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load manifest');
        return res.json();
      })
      .then((data: Manifest) => {
        if (!cancelled) {
          setLocations(data.locations);
          // Auto-select first location
          if (data.locations.length > 0) {
            const first = data.locations[0];
            setSelectedLocationState(first);
            // Set default tracks based on available states
            if (first.available.includes('healthy')) {
              setLeftTrackState('healthy');
            } else {
              setLeftTrackState(first.available[0]);
            }
            if (first.available.includes('degraded')) {
              setRightTrackState('degraded');
            } else {
              setRightTrackState(first.available[first.available.length > 1 ? 1 : 0]);
            }
          }
        }
      })
      .catch(() => {
        // Manifest load failure is non-fatal; locations will be empty
      });
    return () => { cancelled = true; };
  }, []);

  // --- Build audio graph (called once) ---------------------------------------

  const ensureAudioGraph = useCallback(() => {
    if (graphBuiltRef.current && audioCtxRef.current) return audioCtxRef.current;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    // --- Crossfade gain nodes (left vs right) ---
    const lGain = ctx.createGain();
    lGain.gain.value = 1;
    leftGainRef.current = lGain;

    const rGain = ctx.createGain();
    rGain.gain.value = 0;
    rightGainRef.current = rGain;

    // --- Merger: both crossfade gains feed into this node ---
    const merger = ctx.createGain();
    merger.gain.value = 1;
    mergerGainRef.current = merger;

    lGain.connect(merger);
    rGain.connect(merger);

    // --- Parallel filter bank ---
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

    graphBuiltRef.current = true;
    return ctx;
  }, []);

  // --- Load audio buffers for current tracks ---------------------------------

  const loadBuffers = useCallback(async (
    location: LocationInfo,
    left: HealthStatus,
    right: HealthStatus,
  ) => {
    setLoadState('loading');
    try {
      const ctx = ensureAudioGraph();

      const leftUrl = location.files[left];
      const rightUrl = location.files[right];
      if (!leftUrl || !rightUrl) throw new Error('Audio file not available for selected state');

      const [lRes, rRes] = await Promise.all([
        fetch(leftUrl),
        fetch(rightUrl),
      ]);
      if (!lRes.ok || !rRes.ok) throw new Error('Failed to load audio files');

      const [lBuf, rBuf] = await Promise.all([
        ctx.decodeAudioData(await lRes.arrayBuffer()),
        ctx.decodeAudioData(await rRes.arrayBuffer()),
      ]);
      leftBufRef.current = lBuf;
      rightBufRef.current = rBuf;
      setDuration(lBuf.duration);
      setLoadState('ready');
      return true;
    } catch {
      setLoadState('error');
      return false;
    }
  }, [ensureAudioGraph]);

  // --- Playback controls -----------------------------------------------------

  const stopPlayback = useCallback(() => {
    try { leftSourceRef.current?.stop(); } catch { /* noop */ }
    try { rightSourceRef.current?.stop(); } catch { /* noop */ }
    leftSourceRef.current = null;
    rightSourceRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const lBuf = leftBufRef.current;
    const rBuf = rightBufRef.current;
    const lGain = leftGainRef.current;
    const rGain = rightGainRef.current;
    if (!ctx || !lBuf || !rBuf || !lGain || !rGain) return;

    if (ctx.state === 'suspended') ctx.resume();

    const lSource = ctx.createBufferSource();
    lSource.buffer = lBuf;
    lSource.connect(lGain);
    const rSource = ctx.createBufferSource();
    rSource.buffer = rBuf;
    rSource.connect(rGain);

    leftSourceRef.current = lSource;
    rightSourceRef.current = rSource;

    // Loop both sources
    lSource.loop = true;
    rSource.loop = true;

    // Restore crossfade values
    const angle = crossfadeRef.current * Math.PI / 2;
    lGain.gain.setValueAtTime(Math.cos(angle), ctx.currentTime);
    rGain.gain.setValueAtTime(Math.sin(angle), ctx.currentTime);

    // Restore band gains
    const bandGains = [lowGainRef, midGainRef, highGainRef];
    const bandIds: BandId[] = ['low', 'mid', 'high'];
    for (let i = 0; i < bandGains.length; i++) {
      const node = bandGains[i].current;
      if (node) {
        node.gain.setValueAtTime(
          activeBandsRef.current.has(bandIds[i]) ? 1 : 0,
          ctx.currentTime,
        );
      }
    }

    startTimeRef.current = ctx.currentTime;
    lSource.start(0);
    rSource.start(0);
    setIsPlaying(true);

    const tick = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setCurrentTime(elapsed % lBuf.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!selectedLocation) return;

    // If buffers not loaded or load state is idle/error, load them
    if (loadState !== 'ready') {
      const ok = await loadBuffers(selectedLocation, leftTrack, rightTrack);
      if (ok) {
        // Start playback after a micro-delay to let state settle
        setTimeout(() => startPlayback(), 0);
      }
      return;
    }

    startPlayback();
  }, [isPlaying, selectedLocation, loadState, leftTrack, rightTrack, stopPlayback, startPlayback, loadBuffers]);

  // --- Crossfade control -----------------------------------------------------

  const setCrossfade = useCallback((v: number) => {
    setCrossfadeState(v);
    crossfadeRef.current = v;
    const angle = v * Math.PI / 2;
    if (leftGainRef.current) {
      leftGainRef.current.gain.setValueAtTime(
        Math.cos(angle),
        audioCtxRef.current?.currentTime ?? 0,
      );
    }
    if (rightGainRef.current) {
      rightGainRef.current.gain.setValueAtTime(
        Math.sin(angle),
        audioCtxRef.current?.currentTime ?? 0,
      );
    }
  }, []);

  // --- Band toggles ----------------------------------------------------------

  const toggleBand = useCallback((band: BandId) => {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);

      activeBandsRef.current = next;

      const gainMap: Record<BandId, React.RefObject<GainNode | null>> = {
        low: lowGainRef,
        mid: midGainRef,
        high: highGainRef,
      };

      const gainNode = gainMap[band].current;
      const ctx = audioCtxRef.current;
      if (gainNode && ctx) {
        gainNode.gain.setValueAtTime(next.has(band) ? 1 : 0, ctx.currentTime);
      }

      return next;
    });
  }, []);

  // --- Location selection ----------------------------------------------------

  const setSelectedLocation = useCallback((id: string) => {
    const loc = locations.find((l) => l.id === id);
    if (!loc) return;

    // Stop current playback
    const wasPlaying = isPlaying;
    if (wasPlaying) stopPlayback();

    setSelectedLocationState(loc);

    // Reset tracks to defaults for new location
    const newLeft: HealthStatus = loc.available.includes('healthy')
      ? 'healthy'
      : loc.available[0];
    const newRight: HealthStatus = loc.available.includes('degraded')
      ? 'degraded'
      : loc.available[loc.available.length > 1 ? 1 : 0];

    setLeftTrackState(newLeft);
    setRightTrackState(newRight);

    // Reset crossfade to left
    setCrossfade(0);

    // Reset load state so buffers reload
    setLoadState('idle');
    leftBufRef.current = null;
    rightBufRef.current = null;
  }, [locations, isPlaying, stopPlayback, setCrossfade]);

  // --- Track selection -------------------------------------------------------

  const setLeftTrack = useCallback((s: HealthStatus) => {
    if (s === leftTrack) return;
    const wasPlaying = isPlaying;
    if (wasPlaying) stopPlayback();
    setLeftTrackState(s);
    setLoadState('idle');
    leftBufRef.current = null;
    rightBufRef.current = null;

    // If was playing, auto-reload and restart
    if (wasPlaying && selectedLocation) {
      loadBuffers(selectedLocation, s, rightTrack).then((ok) => {
        if (ok) setTimeout(() => startPlayback(), 0);
      });
    }
  }, [leftTrack, rightTrack, isPlaying, selectedLocation, stopPlayback, loadBuffers, startPlayback]);

  const setRightTrack = useCallback((s: HealthStatus) => {
    if (s === rightTrack) return;
    const wasPlaying = isPlaying;
    if (wasPlaying) stopPlayback();
    setRightTrackState(s);
    setLoadState('idle');
    leftBufRef.current = null;
    rightBufRef.current = null;

    // If was playing, auto-reload and restart
    if (wasPlaying && selectedLocation) {
      loadBuffers(selectedLocation, leftTrack, s).then((ok) => {
        if (ok) setTimeout(() => startPlayback(), 0);
      });
    }
  }, [leftTrack, rightTrack, isPlaying, selectedLocation, stopPlayback, loadBuffers, startPlayback]);

  // --- Cleanup ---------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try { leftSourceRef.current?.stop(); } catch { /* noop */ }
      try { rightSourceRef.current?.stop(); } catch { /* noop */ }
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
    activeBands,
    toggleBand,
    locations,
    selectedLocation,
    setSelectedLocation,
    leftTrack,
    rightTrack,
    setLeftTrack,
    setRightTrack,
  };
}
