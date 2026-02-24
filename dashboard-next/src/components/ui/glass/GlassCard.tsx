'use client';

import { cn } from '@/lib/utils';
import { HTMLAttributes, ReactNode } from 'react';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function GlassCard({
  children,
  className,
  title,
  subtitle,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn('glass-panel p-6', className)}
      {...props}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-lg font-light" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
