'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import Link from 'next/link';
import { Play, Pause, Volume2, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { SpectrogramCanvas } from './SpectrogramCanvas';
import { FrequencyBandLabels } from './FrequencyBandLabels';
import { ABCrossfader } from './ABCrossfader';
import { cn } from '@/lib/utils';

interface AudioCompareProps {
  /** When true, uses a smaller vertical layout with a CTA to the full page */
  compact?: boolean;
  className?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function AudioCompare({ compact = false, className }: AudioCompareProps) {
  // --- State ---------------------------------------------------------------
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [crossfade, setCrossfade] = useState(0); // 0 = healthy, 1 = degraded
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(15);
  const [webAudioSupported, setWebAudioSupported] = useState(true);

  // --- Refs ----------------------------------------------------------------
  const audioCtxRef = useRef<AudioContext | null>(null);
  const healthySourceRef = useRef<AudioBufferSourceNode | null>(null);
  const degradedSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const healthyGainRef = useRef<GainNode | null>(null);
  const degradedGainRef = useRef<GainNode | null>(null);
  const healthyAnalyserRef = useRef<AnalyserNode | null>(null);
  const degradedAnalyserRef = useRef<AnalyserNode | null>(null);
  const healthyBufferRef = useRef<AudioBuffer | null>(null);
  const degradedBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // --- Check Web Audio support on mount ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.AudioContext && !(window as unknown as Record<string, unknown>).webkitAudioContext) {
      setWebAudioSupported(false);
    }
  }, []);

  // --- Generate audio on first user interaction ---
  const initAudio = useCallback(async () => {
    if (loadState !== 'idle' || !webAudioSupported) return;

    setLoadState('loading');

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // Fetch real MARRS reef audio files
      const [healthyResponse, degradedResponse] = await Promise.all([
        fetch('/audio/healthy-reef.wav'),
        fetch('/audio/degraded-reef.wav'),
      ]);

      if (!healthyResponse.ok || !degradedResponse.ok) {
        throw new Error('Failed to load audio files');
      }

      const [healthyArrayBuffer, degradedArrayBuffer] = await Promise.all([
        healthyResponse.arrayBuffer(),
        degradedResponse.arrayBuffer(),
      ]);

      const [healthyBuf, degradedBuf] = await Promise.all([
        ctx.decodeAudioData(healthyArrayBuffer),
        ctx.decodeAudioData(degradedArrayBuffer),
      ]);

      healthyBufferRef.current = healthyBuf;
      degradedBufferRef.current = degradedBuf;
      setDuration(healthyBuf.duration);

      // Create gain nodes
      const healthyGain = ctx.createGain();
      const degradedGain = ctx.createGain();
      healthyGain.gain.value = 1;
      degradedGain.gain.value = 0;
      healthyGainRef.current = healthyGain;
      degradedGainRef.current = degradedGain;

      // Create analyser nodes
      const healthyAnalyser = ctx.createAnalyser();
      healthyAnalyser.fftSize = 2048;
      healthyAnalyser.minDecibels = -90;
      healthyAnalyser.maxDecibels = -10;
      healthyAnalyser.smoothingTimeConstant = 0.8;

      const degradedAnalyser = ctx.createAnalyser();
      degradedAnalyser.fftSize = 2048;
      degradedAnalyser.minDecibels = -90;
      degradedAnalyser.maxDecibels = -10;
      degradedAnalyser.smoothingTimeConstant = 0.8;

      healthyAnalyserRef.current = healthyAnalyser;
      degradedAnalyserRef.current = degradedAnalyser;

      // Routing: source -> gain -> analyser -> destination
      healthyGain.connect(healthyAnalyser);
      healthyAnalyser.connect(ctx.destination);
      degradedGain.connect(degradedAnalyser);
      degradedAnalyser.connect(ctx.destination);

      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [loadState, webAudioSupported]);

  // --- Create fresh BufferSourceNodes and start playback ---
  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const healthyBuf = healthyBufferRef.current;
    const degradedBuf = degradedBufferRef.current;
    const hGain = healthyGainRef.current;
    const dGain = degradedGainRef.current;
    if (!ctx || !healthyBuf || !degradedBuf || !hGain || !dGain) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Create new sources (BufferSourceNodes are one-shot)
    const hSource = ctx.createBufferSource();
    hSource.buffer = healthyBuf;
    hSource.connect(hGain);

    const dSource = ctx.createBufferSource();
    dSource.buffer = degradedBuf;
    dSource.connect(dGain);

    healthySourceRef.current = hSource;
    degradedSourceRef.current = dSource;

    // Handle end of playback
    hSource.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (timerRef.current !== null) {
        cancelAnimationFrame(timerRef.current);
        timerRef.current = null;
      }
    };

    startTimeRef.current = ctx.currentTime;
    hSource.start(0);
    dSource.start(0);
    setIsPlaying(true);

    // Time tracker
    const tick = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setCurrentTime(Math.min(elapsed, healthyBuf.duration));
      if (elapsed < healthyBuf.duration) {
        timerRef.current = requestAnimationFrame(tick);
      }
    };
    timerRef.current = requestAnimationFrame(tick);
  }, []);

  // --- Stop playback ---
  const stopPlayback = useCallback(() => {
    try {
      healthySourceRef.current?.stop();
    } catch {
      // may already be stopped
    }
    try {
      degradedSourceRef.current?.stop();
    } catch {
      // may already be stopped
    }
    healthySourceRef.current = null;
    degradedSourceRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    if (timerRef.current !== null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // --- Toggle play / pause ---
  const handleToggle = useCallback(async () => {
    if (loadState === 'idle') {
      await initAudio();
      // Audio will be ready after next render - we start via effect
      return;
    }
    if (loadState !== 'ready') return;

    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [loadState, isPlaying, initAudio, startPlayback, stopPlayback]);

  // Auto-start after init completes (when user pressed play while loading)
  const pendingPlayRef = useRef(false);
  useEffect(() => {
    if (loadState === 'loading') {
      pendingPlayRef.current = true;
    }
    if (loadState === 'ready' && pendingPlayRef.current) {
      pendingPlayRef.current = false;
      startPlayback();
    }
  }, [loadState, startPlayback]);

  // --- Update gain when crossfade changes (equal-power crossfade) ---
  useEffect(() => {
    const angle = crossfade * Math.PI / 2;
    if (healthyGainRef.current) {
      healthyGainRef.current.gain.value = Math.cos(angle);
    }
    if (degradedGainRef.current) {
      degradedGainRef.current.gain.value = Math.sin(angle);
    }
  }, [crossfade]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        cancelAnimationFrame(timerRef.current);
      }
      try { healthySourceRef.current?.stop(); } catch { /* noop */ }
      try { degradedSourceRef.current?.stop(); } catch { /* noop */ }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // --- Render ---------------------------------------------------------------

  if (!webAudioSupported) {
    return (
      <div className={cn('p-6 text-center rounded-lg', className)} style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
        <p>Web Audio API is not supported in this browser.</p>
      </div>
    );
  }

  const spectrogramHeight = compact ? 120 : 200;
  const sampleRate = audioCtxRef.current?.sampleRate ?? 44100;

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('rounded-xl overflow-hidden', className)}>
      {/* Header banner */}
      <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ background: '#252220', color: '#a8a29e' }}>
        <Info className="w-3.5 h-3.5 text-ochre flex-shrink-0" />
        <span>
          Real reef recordings from the MARRS dataset (CC-BY 4.0) -- Williams et al. 2024
        </span>
      </div>

      <div style={{ background: '#0f0d0b' }} className="p-4 space-y-4">
        {/* Play controls + Crossfader */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggle}
            disabled={loadState === 'loading'}
            className={cn(
              'flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0',
              'border-2 transition-all duration-200',
              isPlaying
                ? 'border-ochre bg-ochre/20 text-ochre'
                : 'border-ochre bg-ochre/10 text-ochre hover:bg-ochre/20',
              loadState === 'loading' && 'opacity-60 cursor-wait',
            )}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {loadState === 'loading' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <div className="flex-1">
            <ABCrossfader value={crossfade} onChange={setCrossfade} />
          </div>

          <Volume2 className="w-4 h-4 text-ochre flex-shrink-0 opacity-60" />
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#252220' }}>
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(to right, #cd853f, #e9dcc9)',
            }}
          />
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs" style={{ color: '#a8a29e' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Spectrograms */}
        <div className={cn(compact ? 'space-y-3' : 'grid grid-cols-2 gap-4')}>
          {/* Healthy spectrogram */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#cd853f' }} />
              <span className="text-xs font-semibold" style={{ color: '#cd853f' }}>
                Healthy Reef
              </span>
            </div>
            <div className="relative">
              <SpectrogramCanvas
                analyser={isPlaying ? healthyAnalyserRef.current : null}
                height={spectrogramHeight}
                colorPalette="ocean"
                showFrequencyLabels={!compact}
              />
              {!compact && (
                <div className="absolute inset-0" style={{ left: 50 }}>
                  <FrequencyBandLabels height={spectrogramHeight} sampleRate={sampleRate} />
                </div>
              )}
            </div>
          </div>

          {/* Degraded spectrogram */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#c08081' }} />
              <span className="text-xs font-semibold" style={{ color: '#c08081' }}>
                Degraded Reef
              </span>
            </div>
            <div className="relative">
              <SpectrogramCanvas
                analyser={isPlaying ? degradedAnalyserRef.current : null}
                height={spectrogramHeight}
                colorPalette="thermal"
                showFrequencyLabels={!compact}
              />
            </div>
          </div>
        </div>

        {/* Compact CTA */}
        {compact && (
          <div className="text-center pt-2">
            <Link
              href="/dashboard/compare"
              className="text-xs font-semibold hover:underline"
              style={{ color: '#cd853f' }}
            >
              Open full audio comparison {"\u2192"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
