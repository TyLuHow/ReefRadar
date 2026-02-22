'use client';

import { motion } from 'framer-motion';
import { GlowCard } from '@/components/ui/GlowCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

const stats = [
  {
    value: 84.4,
    suffix: '%',
    label: 'of reefs experiencing bleaching stress',
    glow: 'var(--glow-coral)',
  },
  {
    prefix: '$',
    value: 9.9,
    suffix: ' trillion',
    decimals: 1,
    label: 'in ecosystem services at risk',
    glow: 'var(--glow-gold)',
  },
  {
    value: 2035,
    label: 'when many reefs face irreversible collapse',
    glow: 'var(--glow-cyan)',
  },
];

export function ProblemSection() {
  return (
    <section
      className="relative w-full py-20 sm:py-28 px-4"
      style={{
        background: 'linear-gradient(180deg, var(--abyss) 0%, var(--deep) 100%)',
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.h2
          className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-16 leading-tight"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
        >
          We&apos;ve Lost Half the World&apos;s Coral Reefs in 70 Years
        </motion.h2>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            >
              <GlowCard glowColor={stat.glow} className="text-center h-full">
                <div
                  className="text-3xl sm:text-4xl font-extrabold mb-3"
                  style={{ color: stat.glow }}
                >
                  <AnimatedCounter
                    target={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals ?? (stat.value % 1 !== 0 ? 1 : 0)}
                    duration={2000}
                  />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
              </GlowCard>
            </motion.div>
          ))}
        </div>

        {/* Closing line */}
        <motion.p
          className="text-center text-lg sm:text-xl italic max-w-2xl mx-auto"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          But there&apos;s something we can do &mdash; we can listen.
        </motion.p>
      </div>
    </section>
  );
}
