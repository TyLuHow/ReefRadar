'use client';

import { cn } from '@/lib/utils';
import { ElementType, HTMLAttributes, ReactNode } from 'react';

interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function GlassPanel({
  children,
  className,
  as: Component = 'div',
  ...props
}: GlassPanelProps) {
  return (
    <Component
      className={cn('glass-panel', className)}
      {...props}
    >
      {children}
    </Component>
  );
}
