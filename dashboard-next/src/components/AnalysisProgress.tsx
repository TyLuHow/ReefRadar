'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AnalysisStep = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

interface AnalysisProgressProps {
  step: AnalysisStep;
  progress?: number;
  error?: string;
}

const steps = [
  { id: 'uploading', label: 'Uploading audio', description: 'Sending file to server' },
  { id: 'analyzing', label: 'Analyzing audio', description: 'Processing and classifying' },
  { id: 'complete', label: 'Complete', description: 'Results ready' },
];

export function AnalysisProgress({ step, progress = 0, error }: AnalysisProgressProps) {
  if (step === 'idle') return null;

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="space-y-4">
        {steps.map((s, index) => {
          const isActive = s.id === step;
          const isComplete = currentStepIndex > index || step === 'complete';
          const isError = step === 'error' && isActive;

          return (
            <div key={s.id} className="flex items-start space-x-4">
              {/* Icon */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  isComplete && 'bg-status-healthy text-white',
                  isActive && !isComplete && !isError && 'bg-reef-primary text-white',
                  isError && 'bg-status-degraded text-white',
                  !isActive && !isComplete && 'bg-gray-100 text-gray-400'
                )}
              >
                {isComplete ? (
                  <Check className="w-5 h-5" />
                ) : isActive && !isError ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'font-medium',
                    isActive || isComplete ? 'text-gray-900' : 'text-gray-400'
                  )}
                >
                  {s.label}
                </p>
                <p
                  className={cn(
                    'text-sm',
                    isActive || isComplete ? 'text-gray-500' : 'text-gray-300'
                  )}
                >
                  {s.description}
                </p>

                {/* Progress bar for analyzing step */}
                {isActive && s.id === 'analyzing' && progress > 0 && (
                  <div className="mt-2">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-reef-primary transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {progress}% complete
                    </p>
                  </div>
                )}

                {/* Error message */}
                {isError && error && (
                  <p className="text-sm text-status-degraded mt-1">{error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
