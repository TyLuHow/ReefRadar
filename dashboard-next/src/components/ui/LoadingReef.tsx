'use client';

import { cn } from '@/lib/utils';

interface LoadingReefProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const sizeConfig = {
  sm: { container: 'w-12 h-12', circles: [6, 8, 5, 7], text: 'text-xs' },
  md: { container: 'w-20 h-20', circles: [10, 14, 8, 12], text: 'text-sm' },
  lg: { container: 'w-32 h-32', circles: [16, 22, 12, 18], text: 'text-base' },
};

const reefColors = [
  'var(--glow-cyan)',
  'var(--glow-green)',
  'var(--glow-coral)',
  'var(--glow-gold)',
];

export function LoadingReef({ size = 'md', text }: LoadingReefProps) {
  const config = sizeConfig[size];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn('relative', config.container)}>
        {config.circles.map((circleSize, i) => {
          const angle = (i / config.circles.length) * Math.PI * 2;
          const radius = circleSize * 1.2;
          const cx = 50 + Math.cos(angle) * radius;
          const cy = 50 + Math.sin(angle) * radius;

          return (
            <div
              key={i}
              className="absolute rounded-full reef-pulse"
              style={{
                width: `${circleSize}px`,
                height: `${circleSize}px`,
                backgroundColor: reefColors[i % reefColors.length],
                left: `${cx}%`,
                top: `${cy}%`,
                transform: 'translate(-50%, -50%)',
                animationDelay: `${i * 0.3}s`,
                opacity: 0.8,
              }}
            />
          );
        })}
        <div
          className="absolute rounded-full reef-pulse"
          style={{
            width: `${config.circles[0] * 0.8}px`,
            height: `${config.circles[0] * 0.8}px`,
            backgroundColor: 'var(--glow-cyan)',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            animationDelay: '0.6s',
            opacity: 0.6,
          }}
        />
      </div>
      {text && (
        <p
          className={cn(config.text, 'animate-pulse')}
          style={{ color: 'var(--text-muted)' }}
        >
          {text}
        </p>
      )}
      <style jsx>{`
        @keyframes reef-pulse-anim {
          0%,
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.8;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.4);
            opacity: 0.4;
          }
        }
        .reef-pulse {
          animation: reef-pulse-anim 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
