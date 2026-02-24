'use client';

import { cn } from '@/lib/utils';

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export function GlowCard({
  children,
  className,
  glowColor = '#cd853f',
}: GlowCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-white/10 p-6',
        'hover:border-opacity-50',
        'transition-all duration-300 ease-out',
        className
      )}
      style={
        {
          backgroundColor: 'var(--bg-depths)',
          '--glow-color': glowColor,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = glowColor;
        el.style.boxShadow = `0 0 20px ${glowColor}33, 0 0 40px ${glowColor}1a`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        el.style.boxShadow = 'none';
      }}
    >
      {children}
    </div>
  );
}
