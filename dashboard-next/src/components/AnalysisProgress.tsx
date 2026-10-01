'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AnalysisStep = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

interface AnalysisProgressProps {
  step: AnalysisStep;
  /** The real pipeline stage label from /status (D-15) -- never a numeric percentage. */
  stageLabel?: string;
  error?: string;
  suggestion?: string;
  requestId?: string;
}

const steps = [
  { id: 'uploading', label: 'Uploading audio', description: 'Sending file to server' },
  { id: 'analyzing', label: 'Analyzing audio', description: 'Processing and classifying' },
  { id: 'complete', label: 'Complete', description: 'Results ready' },
];

export function AnalysisProgress({ step, stageLabel, error, suggestion, requestId }: AnalysisProgressProps) {
  if (step === 'idle') return null;

  const currentStepIndex = steps.findIndex((s) => s.id === step);
  // D-15 fix: 'error' is not a step id, so it never matched s.id === step --
  // the error branch below was dead code. On failure, treat 'uploading' as
  // done and 'analyzing' (where polling failures surface) as the errored step.
  const erroredStepId = step === 'error' ? 'analyzing' : null;

  return (
    <div className="glass-panel p-6">
      <div className="space-y-4">
        {steps.map((s, index) => {
          const isActive = step === 'error' ? s.id === erroredStepId : s.id === step;
          const isComplete =
            step === 'error' ? s.id === 'uploading' : currentStepIndex > index || step === 'complete';
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

                {/* Real pipeline stage reported by /status (D-15) -- never a percentage */}
                {isActive && s.id === 'analyzing' && stageLabel && (
                  <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                    {stageLabel}
                  </p>
                )}

                {/* Error message + actionable detail (D-15) */}
                {isError && error && (
                  <div className="mt-1 space-y-1">
                    <p className="text-sm text-status-degraded">{error}</p>
                    {suggestion && (
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {suggestion}
                      </p>
                    )}
                    {requestId && (
                      <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                        Request ID: {requestId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
