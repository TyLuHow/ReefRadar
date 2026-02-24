'use client';

import { cn } from '@/lib/utils';
import { InputHTMLAttributes } from 'react';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function GlassInput({
  label,
  error,
  className,
  id,
  ...props
}: GlassInputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg text-sm',
          'bg-[var(--glass-bg)] text-bone placeholder:text-[var(--text-dim)]',
          'border transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-ochre/50 focus:border-ochre',
          error
            ? 'border-warm-amber'
            : 'border-[var(--glass-border)] hover:border-[var(--glass-border-bright)]',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-warm-amber mt-1">{error}</p>
      )}
    </div>
  );
}
