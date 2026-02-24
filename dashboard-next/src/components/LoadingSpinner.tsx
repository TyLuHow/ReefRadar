'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-ochre',
        sizeClasses[size],
        className
      )}
    />
  );
}

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <LoadingSpinner size="lg" />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-panel p-6 animate-pulse">
      <div className="h-4 rounded w-1/3 mb-4" style={{ background: 'var(--glass-bg-hover)' }} />
      <div className="space-y-3">
        <div className="h-3 rounded w-full" style={{ background: 'var(--glass-bg-hover)' }} />
        <div className="h-3 rounded w-5/6" style={{ background: 'var(--glass-bg-hover)' }} />
        <div className="h-3 rounded w-4/6" style={{ background: 'var(--glass-bg-hover)' }} />
      </div>
    </div>
  );
}
