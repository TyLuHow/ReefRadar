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
    <div className="glass-panel p-6">
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
                  isActive && !isComplete && !isError && 'bg-ochre text-white',
                  isError && 'bg-status-degraded text-white',
                )}
                style={
                  !isActive && !isComplete
                    ? { background: 'var(--glass-bg)', color: 'var(--text-dim)' }
                    : undefined
                }
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
                  className="font-medium"
                  style={{
                    color: isActive || isComplete
                      ? 'var(--text-primary)'
                      : 'var(--text-dim)',
                  }}
                >
                  {s.label}
                </p>
                <p
                  className="text-sm"
                  style={{
                    color: isActive || isComplete
                      ? 'var(--text-muted)'
                      : 'var(--text-dim)',
                  }}
                >
                  {s.description}
                </p>

                {/* Progress bar for analyzing step */}
                {isActive && s.id === 'analyzing' && progress > 0 && (
                  <div className="mt-2">
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ background: 'var(--glass-bg)' }}
                    >
                      <div
                        className="h-full bg-ochre transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
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
