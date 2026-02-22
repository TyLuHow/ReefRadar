'use client';

import { motion } from 'framer-motion';
import { GlowCard } from '@/components/ui/GlowCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

const stats = [
  {
    value: 8,
    label: 'Reference Sites',
    glow: 'var(--glow-cyan)',
  },
  {
    value: 2,
    label: 'Countries',
    glow: 'var(--glow-green)',
  },
  {
    value: 1280,
    label: 'Acoustic Features',
    glow: 'var(--glow-gold)',
  },
  {
    value: 0.933,
    decimals: 3,
    label: 'AUC-ROC',
    glow: 'var(--glow-coral)',
  },
];

export function ImpactStats() {
  return (
    <section
      className="relative w-full py-20 sm:py-28 px-4"
      style={{ background: 'var(--mid)' }}
    >
      <div className="max-w-4xl mx-auto">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-14"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
        >
          By the Numbers
        </motion.h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <GlowCard glowColor={stat.glow} className="text-center py-8">
                <div
                  className="text-3xl sm:text-4xl font-extrabold mb-2"
                  style={{ color: stat.glow }}
                >
                  <AnimatedCounter
                    target={stat.value}
                    decimals={stat.decimals ?? 0}
                    duration={2200}
                  />
                </div>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
