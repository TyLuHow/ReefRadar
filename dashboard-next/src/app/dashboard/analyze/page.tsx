'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { AnalysisResults } from '@/components/AnalysisResults';
import { EmbeddingChart } from '@/components/EmbeddingChart';
import { SpectrogramCanvas } from '@/components/audio/SpectrogramCanvas';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';
import { RegionWarning } from '@/components/dashboard/RegionWarning';
import { toast } from '@/components/Toast';
import { api } from '@/lib/api';
import { AnalysisResult } from '@/types';
import {
  Upload,
  Sparkles,
  BarChart3,
  Zap,
  RefreshCw,
  MapPin,
  Play,
  Square,
  AudioLines,
} from 'lucide-react';

type AnalysisStep = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export default function EnhancedAnalyzePage() {
  // --- Upload / Analysis state ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisStep, setAnalysisStep] = useState<AnalysisStep>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');

  // --- Preview spectrogram state ---
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewSupported, setPreviewSupported] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [analyserReady, setAnalyserReady] = useState<AnalyserNode | null>(null);

  // Check Web Audio support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (
      !window.AudioContext &&
      !(window as unknown as Record<string, unknown>).webkitAudioContext
    ) {
      setPreviewSupported(false);
    }
  }, []);

  // --- Decode uploaded WAV into an AudioBuffer for preview ---
  const decodeFileForPreview = useCallback(async (file: File) => {
    if (!previewSupported) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;

      // Create analyser
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Create gain
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gainRef.current = gain;

      gain.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      // Not a valid audio file for preview, that is fine - the backend
      // will do the real validation.
      audioBufferRef.current = null;
    }
  }, [previewSupported]);

  // --- File selection ---
  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setAnalysisStep('idle');
      setAnalysisResult(null);
      setError(null);
      decodeFileForPreview(file);
    },
    [decodeFileForPreview],
  );

  const stopPreview = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    setPreviewPlaying(false);
    setAnalyserReady(null);
  }, []);

  const handleClearFile = useCallback(() => {
    stopPreview();
    setSelectedFile(null);
    setAnalysisStep('idle');
    setAnalysisResult(null);
    setError(null);
    setAnalysisProgress(0);
    audioBufferRef.current = null;
  }, [stopPreview]);

  // --- Preview playback ---
  const togglePreview = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buf = audioBufferRef.current;
    const gain = gainRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !buf || !gain || !analyser) return;

    if (previewPlaying) {
      stopPreview();
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    sourceRef.current = src;

    src.onended = () => {
      setPreviewPlaying(false);
      setAnalyserReady(null);
    };

    src.start(0);
    setPreviewPlaying(true);
    setAnalyserReady(analyser);
  }, [previewPlaying, stopPreview]);

  // --- Analyze ---
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    stopPreview();
    setError(null);
    setAnalysisStep('uploading');
    setAnalysisProgress(0);

    try {
      toast.info('Uploading audio file...');
      const uploadResult = await api.uploadAudio(selectedFile);
      toast.success(`Uploaded: ${uploadResult.upload_id}`);

      setAnalysisStep('analyzing');
      toast.info('Starting analysis...');
      const lat = latitude ? parseFloat(latitude) : undefined;
      const lon = longitude ? parseFloat(longitude) : undefined;
      const analyzeResult = await api.startAnalysis(
        uploadResult.upload_id,
        lat,
        lon,
      );
      toast.success(`Analysis started: ${analyzeResult.analysis_id}`);

      let attempts = 0;
      const maxAttempts = 60;

      const pollResult = await api.pollAnalysis(
        analyzeResult.analysis_id,
        () => {
          attempts++;
          setAnalysisProgress(
            Math.min(Math.round((attempts / maxAttempts) * 100), 95),
          );
        },
      );

      setAnalysisProgress(100);
      setAnalysisStep('complete');
      setAnalysisResult(pollResult);
      toast.success('Analysis complete!');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setAnalysisStep('error');
      toast.error(errorMessage);
    }
  }, [selectedFile, latitude, longitude, stopPreview]);

  const handleReset = useCallback(() => {
    stopPreview();
    setSelectedFile(null);
    setAnalysisStep('idle');
    setAnalysisResult(null);
    setError(null);
    setAnalysisProgress(0);
    audioBufferRef.current = null;
  }, [stopPreview]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        /* noop */
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const isAnalyzing =
    analysisStep === 'uploading' || analysisStep === 'analyzing';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Analyze Reef Audio
        </h1>
        <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Upload underwater audio recordings to analyze coral reef health using
          AI-powered acoustic analysis
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - Upload and Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* File Upload */}
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center" style={{ color: 'var(--text-primary)' }}>
              <Upload className="w-5 h-5 mr-2 text-ochre" />
              Upload Audio
            </h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onClear={handleClearFile}
              disabled={isAnalyzing}
            />

            {/* Spectrogram Preview */}
            {selectedFile &&
              analysisStep === 'idle' &&
              audioBufferRef.current &&
              previewSupported && (
                <div
                  className="mt-4 p-4 rounded-lg"
                  style={{ background: 'var(--bg-depths)', border: '1px solid var(--glass-border)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AudioLines className="w-4 h-4 text-ochre" />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Audio Preview
                      </span>
                    </div>
                    <button
                      onClick={togglePreview}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                      style={{
                        background: 'rgba(205, 133, 63, 0.15)',
                        color: '#cd853f',
                        border: '1px solid rgba(205, 133, 63, 0.3)',
                      }}
                    >
                      {previewPlaying ? (
                        <>
                          <Square className="w-3 h-3" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Preview
                        </>
                      )}
                    </button>
                  </div>
                  <SpectrogramCanvas
                    analyser={analyserReady}
                    height={120}
                    colorPalette="ocean"
                    showFrequencyLabels={false}
                  />
                  {!previewPlaying && (
                    <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
                      Press Preview to see the live spectrogram of your
                      recording
                    </p>
                  )}
                </div>
              )}

            {/* Optional Coordinates */}
            {selectedFile && analysisStep === 'idle' && (
              <div
                className="mt-4 p-4 rounded-lg"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
              >
                <div className="flex items-center mb-2">
                  <MapPin className="w-4 h-4 mr-2" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Recording Location (optional)
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  Providing coordinates enables geographic region detection and
                  confidence adjustment.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude (e.g. -4.93)"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="px-3 py-2 rounded-md text-sm"
                    style={{
                      background: 'var(--bg-depths)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude (e.g. 119.32)"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="px-3 py-2 rounded-md text-sm"
                    style={{
                      background: 'var(--bg-depths)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Analyze Button */}
            {selectedFile && analysisStep === 'idle' && (
              <button
                onClick={handleAnalyze}
                className="mt-4 w-full bg-ochre hover:bg-ochre/90 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span>Analyze Audio</span>
              </button>
            )}

            {/* Reset Button */}
            {(analysisStep === 'complete' || analysisStep === 'error') && (
              <button
                onClick={handleReset}
                className="mt-4 w-full font-semibold py-3 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw className="w-5 h-5" />
                <span>Analyze Another File</span>
              </button>
            )}
          </div>

          {/* Progress */}
          {(isAnalyzing || analysisStep === 'error') && (
            <AnalysisProgress
              step={analysisStep}
              progress={analysisProgress}
              error={error || undefined}
            />
          )}

          {/* Results */}
          {analysisStep === 'complete' && analysisResult && (
            <>
              {/* Region Warning */}
              {analysisResult.classification?.region &&
                !analysisResult.classification.region
                  .in_training_distribution && (
                  <RegionWarning
                    region={analysisResult.classification.region}
                    className="mb-2"
                  />
                )}

              <AnalysisResults result={analysisResult} />
              <EmbeddingChart result={analysisResult} />

              {/* Caveats */}
              <CaveatsBanner defaultExpanded={false} />
            </>
          )}
        </div>

        {/* Right Column - How It Works */}
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              How It Works
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 text-ochre rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                  1
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Upload</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Upload your underwater audio recording (WAV format)
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 text-ochre rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                  2
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Process</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Audio is converted to 32kHz and segmented into 5s windows
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 text-ochre rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                  3
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Analyze</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    AI model extracts 1280-dimensional acoustic features
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 text-ochre rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                  4
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Compare</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Trained classifier determines reef health status
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 text-ochre rounded-full flex items-center justify-center flex-shrink-0 font-semibold" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
                  5
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Results</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Health classification and similar reference sites
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-ochre to-dusty-rose rounded-xl p-6 text-white">
            <h2 className="text-lg font-semibold mb-4">Quick Facts</h2>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <BarChart3 className="w-5 h-5 opacity-80" />
                <span className="text-sm">1280-dimensional embeddings</span>
              </div>
              <div className="flex items-center space-x-3">
                <Zap className="w-5 h-5 opacity-80" />
                <span className="text-sm">Real-time processing</span>
              </div>
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 opacity-80" />
                <span className="text-sm">SurfPerch AI model</span>
              </div>
            </div>
          </div>

          {/* Supported Formats */}
          <div className="glass-panel p-6">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Requirements</h3>
            <ul className="text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
              <li>WAV format audio files</li>
              <li>Maximum file size: 50MB</li>
              <li>Minimum duration: 5 seconds</li>
              <li>Best results with underwater recordings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
