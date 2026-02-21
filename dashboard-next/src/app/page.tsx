'use client';

import { useState, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { AnalysisResults } from '@/components/AnalysisResults';
import { EmbeddingChart } from '@/components/EmbeddingChart';
import { toast } from '@/components/Toast';
import { api } from '@/lib/api';
import { AnalysisResult } from '@/types';
import { Upload, Sparkles, BarChart3, Zap, RefreshCw, MapPin } from 'lucide-react';

type AnalysisStep = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export default function AnalyzePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisStep, setAnalysisStep] = useState<AnalysisStep>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setAnalysisStep('idle');
    setAnalysisResult(null);
    setError(null);
  }, []);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setAnalysisStep('idle');
    setAnalysisResult(null);
    setError(null);
    setAnalysisProgress(0);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    setError(null);
    setAnalysisStep('uploading');
    setAnalysisProgress(0);

    try {
      // Step 1: Upload file
      toast.info('Uploading audio file...');
      const uploadResult = await api.uploadAudio(selectedFile);
      toast.success(`Uploaded: ${uploadResult.upload_id}`);

      // Step 2: Start analysis
      setAnalysisStep('analyzing');
      toast.info('Starting analysis...');
      const lat = latitude ? parseFloat(latitude) : undefined;
      const lon = longitude ? parseFloat(longitude) : undefined;
      const analyzeResult = await api.startAnalysis(uploadResult.upload_id, lat, lon);
      toast.success(`Analysis started: ${analyzeResult.analysis_id}`);

      // Step 3: Poll for results
      let attempts = 0;
      const maxAttempts = 60;

      const pollResult = await api.pollAnalysis(
        analyzeResult.analysis_id,
        (status) => {
          attempts++;
          setAnalysisProgress(Math.min(Math.round((attempts / maxAttempts) * 100), 95));
        }
      );

      // Complete
      setAnalysisProgress(100);
      setAnalysisStep('complete');
      setAnalysisResult(pollResult);
      toast.success('Analysis complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setAnalysisStep('error');
      toast.error(errorMessage);
    }
  }, [selectedFile, latitude, longitude]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setAnalysisStep('idle');
    setAnalysisResult(null);
    setError(null);
    setAnalysisProgress(0);
  }, []);

  const isAnalyzing = analysisStep === 'uploading' || analysisStep === 'analyzing';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Analyze Reef Audio
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload underwater audio recordings to analyze coral reef health using
          AI-powered acoustic analysis
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - Upload and Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* File Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Upload className="w-5 h-5 mr-2 text-reef-primary" />
              Upload Audio
            </h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onClear={handleClearFile}
              disabled={isAnalyzing}
            />

            {/* Optional Coordinates */}
            {selectedFile && analysisStep === 'idle' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center mb-2">
                  <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Recording Location (optional)</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Providing coordinates enables geographic region detection and confidence adjustment.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude (e.g. -4.93)"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-reef-primary focus:border-reef-primary"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude (e.g. 119.32)"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-reef-primary focus:border-reef-primary"
                  />
                </div>
              </div>
            )}

            {/* Analyze Button */}
            {selectedFile && analysisStep === 'idle' && (
              <button
                onClick={handleAnalyze}
                className="mt-4 w-full bg-reef-primary hover:bg-reef-primary/90 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span>Analyze Audio</span>
              </button>
            )}

            {/* Reset Button */}
            {(analysisStep === 'complete' || analysisStep === 'error') && (
              <button
                onClick={handleReset}
                className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors"
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
              <AnalysisResults result={analysisResult} />
              <EmbeddingChart result={analysisResult} />
            </>
          )}
        </div>

        {/* Right Column - How It Works */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              How It Works
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-reef-light text-reef-primary rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-900">Upload</p>
                  <p className="text-sm text-gray-500">
                    Upload your underwater audio recording (WAV format)
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-reef-light text-reef-primary rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-900">Process</p>
                  <p className="text-sm text-gray-500">
                    Audio is converted to 32kHz and segmented into 5s windows
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-reef-light text-reef-primary rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-900">Analyze</p>
                  <p className="text-sm text-gray-500">
                    AI model extracts 1280-dimensional acoustic features
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-reef-light text-reef-primary rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  4
                </div>
                <div>
                  <p className="font-medium text-gray-900">Compare</p>
                  <p className="text-sm text-gray-500">
                    Trained classifier determines reef health status
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-reef-light text-reef-primary rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  5
                </div>
                <div>
                  <p className="font-medium text-gray-900">Results</p>
                  <p className="text-sm text-gray-500">
                    Health classification and similar reference sites
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-reef-primary to-reef-secondary rounded-xl p-6 text-white">
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
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Requirements</h3>
            <ul className="text-sm text-gray-600 space-y-2">
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
