import { create } from 'zustand';
import type { AnalysisResult } from '@/types';

type AnalysisStage =
  | 'idle'
  | 'uploading'
  | 'preprocessing'
  | 'embedding'
  | 'classifying'
  | 'complete'
  | 'failed';

interface AnalysisState {
  // Upload state
  uploadId: string | null;
  analysisId: string | null;

  // Processing state
  stage: AnalysisStage;
  progress: string;
  error: string | null;

  // Results
  results: AnalysisResult | null;

  // Actions
  setUploadId: (id: string) => void;
  setAnalysisId: (id: string) => void;
  setStage: (stage: AnalysisStage) => void;
  setProgress: (progress: string) => void;
  setError: (error: string) => void;
  setResults: (results: AnalysisResult) => void;
  reset: () => void;
}

const initialState = {
  uploadId: null,
  analysisId: null,
  stage: 'idle' as AnalysisStage,
  progress: '',
  error: null,
  results: null,
};

export const useAnalysisStore = create<AnalysisState>((set) => ({
  ...initialState,

  setUploadId: (id: string) => set({ uploadId: id }),
  setAnalysisId: (id: string) => set({ analysisId: id }),
  setStage: (stage: AnalysisStage) => set({ stage }),
  setProgress: (progress: string) => set({ progress }),
  setError: (error: string) => set({ error, stage: 'failed' }),
  setResults: (results: AnalysisResult) =>
    set({ results, stage: 'complete' }),
  reset: () => set(initialState),
}));
