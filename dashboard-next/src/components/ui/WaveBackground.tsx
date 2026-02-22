'use client';

import { cn } from '@/lib/utils';

interface WaveBackgroundProps {
  variant?: 'top' | 'bottom' | 'both';
  className?: string;
  children?: React.ReactNode;
}

export function WaveBackground({
  variant = 'bottom',
  className,
  children,
}: WaveBackgroundProps) {
  const showTop = variant === 'top' || variant === 'both';
  const showBottom = variant === 'bottom' || variant === 'both';

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {showTop && (
        <div className="absolute top-0 left-0 w-full h-24 pointer-events-none">
          <svg
            className="wave-svg wave-svg-1 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,0 L0,0 Z"
              fill="var(--abyss)"
              fillOpacity="0.4"
            />
          </svg>
          <svg
            className="wave-svg wave-svg-2 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,40 C360,100 720,0 1080,80 C1260,40 1380,60 1440,40 L1440,0 L0,0 Z"
              fill="var(--deep)"
              fillOpacity="0.3"
            />
          </svg>
          <svg
            className="wave-svg wave-svg-3 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,80 C180,20 360,100 540,40 C720,80 900,20 1080,60 C1260,100 1380,30 1440,80 L1440,0 L0,0 Z"
              fill="var(--mid)"
              fillOpacity="0.2"
            />
          </svg>
        </div>
      )}

      {children}

      {showBottom && (
        <div className="absolute bottom-0 left-0 w-full h-24 pointer-events-none">
          <svg
            className="wave-svg wave-svg-1 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,60 C240,0 480,120 720,60 C960,0 1200,120 1440,60 L1440,120 L0,120 Z"
              fill="var(--abyss)"
              fillOpacity="0.4"
            />
          </svg>
          <svg
            className="wave-svg wave-svg-2 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,80 C360,20 720,120 1080,40 C1260,80 1380,60 1440,80 L1440,120 L0,120 Z"
              fill="var(--deep)"
              fillOpacity="0.3"
            />
          </svg>
          <svg
            className="wave-svg wave-svg-3 absolute w-[200%] h-full"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,40 C180,100 360,20 540,80 C720,40 900,100 1080,60 C1260,20 1380,90 1440,40 L1440,120 L0,120 Z"
              fill="var(--mid)"
              fillOpacity="0.2"
            />
          </svg>
        </div>
      )}

      <style jsx>{`
        @keyframes wave-drift-1 {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes wave-drift-2 {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes wave-drift-3 {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .wave-svg-1 {
          animation: wave-drift-1 12s linear infinite;
        }
        .wave-svg-2 {
          animation: wave-drift-2 18s linear infinite;
        }
        .wave-svg-3 {
          animation: wave-drift-3 25s linear infinite;
        }
      `}</style>
    </div>
  );
}
