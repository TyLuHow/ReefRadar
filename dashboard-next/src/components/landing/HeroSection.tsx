'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export function HeroSection() {
  return (
    <section
      className="relative w-full overflow-hidden flex items-center justify-center"
      style={{
        height: '100vh',
        minHeight: 560,
        background: 'var(--abyss)',
      }}
    >
      {/* CSS-only underwater particles */}
      <div className="particles-container" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="particle" />
        ))}
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 text-center px-4 max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        <h1
          className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight mb-6"
          style={{
            background: 'linear-gradient(135deg, var(--glow-cyan), var(--glow-green))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          The Ocean Has a Voice
        </h1>

        <p
          className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          AI-powered acoustic monitoring for the world&apos;s coral reefs
        </p>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.8 }}
      >
        <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-5 h-5" style={{ color: 'var(--glow-cyan)' }} />
        </motion.div>
      </motion.div>

      {/* Particle styles */}
      <style jsx>{`
        .particles-container {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .particle {
          position: absolute;
          display: block;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          opacity: 0;
          animation: drift-up linear infinite;
        }
        ${Array.from({ length: 40 })
          .map((_, i) => {
            const left = Math.round(Math.random() * 100);
            const delay = (Math.random() * 12).toFixed(2);
            const dur = (8 + Math.random() * 12).toFixed(2);
            const size = (1 + Math.random() * 2).toFixed(1);
            const maxOpacity = (0.15 + Math.random() * 0.25).toFixed(2);
            return `.particle:nth-child(${i + 1}){left:${left}%;bottom:-4px;width:${size}px;height:${size}px;animation-delay:${delay}s;animation-duration:${dur}s;--max-opacity:${maxOpacity};}`;
          })
          .join('\n')}
        @keyframes drift-up {
          0% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          10% {
            opacity: var(--max-opacity, 0.2);
          }
          90% {
            opacity: var(--max-opacity, 0.2);
          }
          100% {
            transform: translateY(-100vh) translateX(20px);
            opacity: 0;
          }
        }
      `}</style>
    </section>
  );
}
