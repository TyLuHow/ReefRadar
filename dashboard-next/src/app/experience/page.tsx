'use client';

import { useReducer, useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Upload, Play, Pause } from 'lucide-react';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { ProcessingOverlay } from '@/components/experience/ProcessingOverlay';
import { CoordinateModal } from '@/components/experience/CoordinateModal';
import { ControlsPanel } from '@/components/experience/ControlsPanel';
import { ComparisonPanel } from '@/components/experience/ComparisonPanel';
import { CaveatsFooter } from '@/components/experience/CaveatsFooter';
import { DemoState } from '@/components/experience/DemoState';
import { LocationCompare } from '@/components/experience/LocationCompare';
import { validateWavFile } from '@/lib/utils';
import { api } from '@/lib/api';
import { FALLBACK_SAMPLES } from '@/lib/samples';
import { useVitalityStore } from '@/stores/vitality-store';
import type { AnalysisResult, Sample } from '@/types';

const SpectrogramCanvas = dynamic(
  () => import('@/components/spectrogram/SpectrogramCanvas'),
  { ssr: false }
);

const API_BASE = 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';

// --- State machine -----------------------------------------------------------

type ExperienceState =
  | { type: 'landing' }
  | { type: 'demo' }
  | { type: 'compare' }
  | { type: 'sample'; sampleId: string }
  | { type: 'uploading'; file: File }
  | { type: 'processing'; analysisId: string }
  | { type: 'results'; data: AnalysisResult; audioUrl?: string }
  | { type: 'error'; message: string };

type ExperienceAction =
  | { type: 'GO_LANDING' }
  | { type: 'GO_DEMO' }
  | { type: 'GO_COMPARE' }
  | { type: 'GO_SAMPLE'; sampleId: string }
  | { type: 'FILE_SELECTED'; file: File }
  | { type: 'START_PROCESSING'; analysisId: string }
  | { type: 'RESULTS_READY'; data: AnalysisResult; audioUrl?: string }
  | { type: 'ERROR'; message: string };

function reducer(_state: ExperienceState, action: ExperienceAction): ExperienceState {
  switch (action.type) {
    case 'GO_LANDING':
      return { type: 'landing' };
    case 'GO_DEMO':
      return { type: 'demo' };
    case 'GO_COMPARE':
      return { type: 'compare' };
    case 'GO_SAMPLE':
      return { type: 'sample', sampleId: action.sampleId };
    case 'FILE_SELECTED':
      return { type: 'uploading', file: action.file };
    case 'START_PROCESSING':
      return { type: 'processing', analysisId: action.analysisId };
    case 'RESULTS_READY':
      return { type: 'results', data: action.data, audioUrl: action.audioUrl };
    case 'ERROR':
      return { type: 'error', message: action.message };
    default:
      return _state;
  }
}

// --- Inner component (needs useSearchParams) ---------------------------------

function ExperienceInner() {
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, { type: 'landing' });
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const sampleId = searchParams.get('sample');
    if (sampleId) {
      dispatch({ type: 'GO_SAMPLE', sampleId });
    } else {
      const mode = searchParams.get('mode');
      if (mode === 'demo') dispatch({ type: 'GO_DEMO' });
      else if (mode === 'compare') dispatch({ type: 'GO_COMPARE' });
    }
  }, [searchParams]);

  const content = (() => {
    switch (state.type) {
      case 'landing':
        return <LandingState key="landing" dispatch={dispatch} />;
      case 'demo':
        return (
          <DemoState
            key="demo"
            onGoLanding={() => dispatch({ type: 'GO_LANDING' })}
            onGoCompare={() => dispatch({ type: 'GO_COMPARE' })}
          />
        );
      case 'compare':
        return (
          <LocationCompare
            key="compare"
            onGoLanding={() => dispatch({ type: 'GO_LANDING' })}
            onGoDemo={() => dispatch({ type: 'GO_DEMO' })}
          />
        );
      case 'sample':
        return (
          <SamplePlaybackState
            key={`sample-${state.sampleId}`}
            sampleId={state.sampleId}
            dispatch={dispatch}
          />
        );
      case 'uploading':
        return <UploadingState key="uploading" file={state.file} dispatch={dispatch} />;
      case 'processing':
        return <ProcessingState key="processing" analysisId={state.analysisId} dispatch={dispatch} />;
      case 'results':
        return <ResultsState key="results" data={state.data} dispatch={dispatch} />;
      case 'error':
        return <ErrorState key="error" message={state.message} dispatch={dispatch} />;
    }
  })();

  return (
    <AnimatePresence mode="wait">
      {content}
    </AnimatePresence>
  );
}

// --- Landing state -----------------------------------------------------------

function LandingState({ dispatch }: { dispatch: React.Dispatch<ExperienceAction> }) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const validation = validateWavFile(file);
    if (!validation.valid) {
      dispatch({ type: 'ERROR', message: validation.error || 'Invalid file' });
      return;
    }
    dispatch({ type: 'FILE_SELECTED', file });
  }

  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="idle" opacity={0.15} />
      </div>

      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <GlassButton variant="ghost" href="/">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </GlassButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full bg-bone/30" />
        </div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg w-full space-y-6 text-center">
          <h1 className="text-2xl font-light text-bone">Analyze Reef Audio</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Upload a WAV recording to classify reef health, or explore demo audio
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <GlassButton onClick={() => dispatch({ type: 'GO_DEMO' })}>
              Listen to Demo
            </GlassButton>
            <GlassButton variant="ghost" onClick={() => dispatch({ type: 'GO_COMPARE' })}>
              Compare Locations
            </GlassButton>
          </div>

          <GlassPanel
            className={`p-10 border-dashed cursor-pointer w-full ${
              dragOver ? 'border-ochre/60 bg-ochre/5' : ''
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e: React.DragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: React.DragEvent) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-ochre/60" />
            <p className="text-sm text-bone/80 mb-1">
              Drop a WAV file here, or click to browse
            </p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Max 50 MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,audio/wav"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </GlassPanel>
        </div>
      </div>
    </motion.div>
  );
}

// --- Uploading state ---------------------------------------------------------

function UploadingState({
  file,
  dispatch,
}: {
  file: File;
  dispatch: React.Dispatch<ExperienceAction>;
}) {
  async function handleSubmit(f: File, latitude?: number, longitude?: number) {
    try {
      const arrayBuffer = await f.arrayBuffer();
      const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'X-Filename': f.name,
        },
        body: arrayBuffer,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(
          (errData as Record<string, Record<string, string>>)?.error?.message ||
            `Upload failed: ${uploadRes.status}`
        );
      }

      const { upload_id } = (await uploadRes.json()) as { upload_id: string };

      const analyzePayload: Record<string, unknown> = { upload_id };
      if (latitude !== undefined) analyzePayload.latitude = latitude;
      if (longitude !== undefined) analyzePayload.longitude = longitude;

      const analyzeRes = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzePayload),
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({}));
        throw new Error(
          (errData as Record<string, Record<string, string>>)?.error?.message ||
            `Analysis start failed: ${analyzeRes.status}`
        );
      }

      const { analysis_id } = (await analyzeRes.json()) as { analysis_id: string };
      dispatch({ type: 'START_PROCESSING', analysisId: analysis_id });
    } catch (err) {
      dispatch({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  return (
    <motion.div
      className="relative min-h-screen"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="idle" opacity={0.1} />
      </div>
      <div className="relative z-10 px-4">
        <CoordinateModal
          file={file}
          onSubmit={handleSubmit}
          onCancel={() => dispatch({ type: 'GO_LANDING' })}
        />
      </div>
    </motion.div>
  );
}

// --- Processing state --------------------------------------------------------

function ProcessingState({
  analysisId,
  dispatch,
}: {
  analysisId: string;
  dispatch: React.Dispatch<ExperienceAction>;
}) {
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;

    const poll = async () => {
      while (!cancelled && attempts < maxAttempts) {
        try {
          const res = await fetch(`${API_BASE}/visualize/${analysisId}`);
          if (!res.ok) {
            attempts++;
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const data = (await res.json()) as AnalysisResult;
          if (data.status === 'complete') {
            if (!cancelled) dispatch({ type: 'RESULTS_READY', data });
            return;
          }
          if (data.status === 'failed') {
            const errMsg =
              typeof data.error === 'string'
                ? data.error
                : (data.error as { message?: string })?.message || 'Analysis failed';
            if (!cancelled) dispatch({ type: 'ERROR', message: errMsg });
            return;
          }
        } catch {
          // network error, retry
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) {
        dispatch({ type: 'ERROR', message: 'Analysis timed out after 120 seconds' });
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [analysisId, dispatch]);

  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="analyzing" opacity={0.2} />
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <div />
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full bg-ochre" />
        </div>
      </div>
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <ProcessingOverlay />
      </div>
    </motion.div>
  );
}

// --- Results state -----------------------------------------------------------

function ResultsState({
  data,
  dispatch,
}: {
  data: AnalysisResult;
  dispatch: React.Dispatch<ExperienceAction>;
}) {
  // Drive vitality from ML classification result
  useEffect(() => {
    if (data.classification?.label) {
      const v = ML_TO_VITALITY[data.classification.label] ?? 0;
      useVitalityStore.getState().setVitality(v, 'ml');
    }
    return () => {
      useVitalityStore.getState().setVitality(0, 'default');
    };
  }, [data.classification?.label]);

  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="idle" opacity={0.12} />
      </div>

      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <GlassButton variant="ghost" onClick={() => dispatch({ type: 'GO_LANDING' })}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          New Analysis
        </GlassButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full bg-bone/30" />
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-6 pb-6 overflow-auto">
        <motion.div
          className="lg:w-80 flex-shrink-0"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0 }}
        >
          <ControlsPanel
            analysisData={data}
            onCompare={() => dispatch({ type: 'GO_DEMO' })}
          />
        </motion.div>
        <motion.div
          className="flex-1"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        >
          <ComparisonPanel analysisData={data} />
        </motion.div>
      </div>

      <div className="relative z-10 px-4 sm:px-6">
        <CaveatsFooter />
      </div>
    </motion.div>
  );
}

// --- Error state -------------------------------------------------------------

function ErrorState({
  message,
  dispatch,
}: {
  message: string;
  dispatch: React.Dispatch<ExperienceAction>;
}) {
  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state="idle" opacity={0.1} />
      </div>

      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <GlassButton variant="ghost" href="/">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Home
        </GlassButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full bg-warm-amber" />
        </div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <GlassPanel className="p-8 max-w-md w-full text-center space-y-4">
          <h2 className="text-lg font-light text-bone">Something Went Wrong</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
          <GlassButton onClick={() => dispatch({ type: 'GO_LANDING' })}>
            Try Again
          </GlassButton>
        </GlassPanel>
      </div>
    </motion.div>
  );
}

// --- Sample playback state ---------------------------------------------------

const ML_TO_VITALITY: Record<string, number> = {
  healthy: 1.0,
  restored_mid: 0.7,
  restored_early: 0.4,
  degraded: 0.0,
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'var(--status-healthy)' },
  degraded: { label: 'Degraded', color: 'var(--status-degraded)' },
  restored_early: { label: 'Early Restoration', color: 'var(--status-restoring-early)' },
  restored_mid: { label: 'Mid Restoration', color: 'var(--status-restoring-mid)' },
};

function SamplePlaybackState({
  sampleId,
  dispatch,
}: {
  sampleId: string;
  dispatch: React.Dispatch<ExperienceAction>;
}) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load sample metadata
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getSamples();
        const found = data.samples.find((s) => s.id === sampleId);
        if (!cancelled && found) setSample(found);
        else if (!cancelled) {
          // Try fallback
          const fallback = FALLBACK_SAMPLES.find((s) => s.id === sampleId);
          if (fallback) setSample(fallback);
          else dispatch({ type: 'ERROR', message: `Sample "${sampleId}" not found` });
        }
      } catch {
        if (!cancelled) {
          const fallback = FALLBACK_SAMPLES.find((s) => s.id === sampleId);
          if (fallback) setSample(fallback);
          else dispatch({ type: 'ERROR', message: `Could not load sample "${sampleId}"` });
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sampleId, dispatch]);

  const togglePlay = useCallback(() => {
    if (!sample?.audio_url) return;
    if (!audioRef.current) {
      const audio = new Audio(sample.audio_url);
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => {
        setProgress(0);
        setIsPlaying(false);
      });
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [sample, isPlaying]);

  // Drive vitality from sample category
  useEffect(() => {
    if (sample) {
      const v = ML_TO_VITALITY[sample.category] ?? 0;
      useVitalityStore.getState().setVitality(v, 'ml');
    }
    return () => {
      useVitalityStore.getState().setVitality(0, 'default');
    };
  }, [sample]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!sample) {
    return (
      <motion.div
        className="relative min-h-screen flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="absolute inset-0 z-0">
          <SpectrogramCanvas state="idle" opacity={0.1} />
        </div>
        <p className="relative z-10 text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading sample...
        </p>
      </motion.div>
    );
  }

  const badge = STATUS_BADGE[sample.category] || { label: sample.category, color: 'var(--text-muted)' };

  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas state={isPlaying ? 'playing' : 'idle'} opacity={0.2} />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <GlassButton variant="ghost" href="/">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Gallery
        </GlassButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: badge.color }} />
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <div className="max-w-xl w-full">
          <GlassPanel className="p-8 space-y-6">
            {/* Badge + country */}
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] uppercase tracking-widest font-medium px-2.5 py-1 rounded-full border"
                style={{ color: badge.color, borderColor: badge.color + '40' }}
              >
                {badge.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {sample.country}
              </span>
            </div>

            {/* Title + description */}
            <div>
              <h2 className="text-xl font-light text-bone mb-2">{sample.name}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {sample.description}
              </p>
            </div>

            {/* Play button + progress */}
            {sample.audio_url && (
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center w-14 h-14 rounded-full border-2 transition-colors"
                  style={{ borderColor: badge.color, color: badge.color }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-200"
                      style={{ width: `${progress * 100}%`, background: badge.color }}
                    />
                  </div>
                  <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-dim)' }}>
                    {sample.duration_seconds} seconds
                  </p>
                </div>
              </div>
            )}

            {/* Frequency highlights */}
            <div className="flex flex-wrap gap-2">
              {sample.frequency_highlights.map((h) => (
                <span
                  key={h}
                  className="text-[10px] px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--glass-bg)', color: 'var(--text-muted)' }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <GlassButton onClick={() => dispatch({ type: 'GO_LANDING' })}>
                Upload Your Own
              </GlassButton>
              <GlassButton variant="ghost" onClick={() => dispatch({ type: 'GO_DEMO' })}>
                Compare Healthy vs Degraded
              </GlassButton>
            </div>
          </GlassPanel>
        </div>
      </div>

      <div className="relative z-10 px-4 sm:px-6">
        <CaveatsFooter />
      </div>
    </motion.div>
  );
}

// --- Page export (wrapped in Suspense for useSearchParams) -------------------

export default function ExperiencePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-abyss" />}>
      <ExperienceInner />
    </Suspense>
  );
}
