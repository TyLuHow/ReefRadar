'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const AudioCompare = dynamic(
  () => import('@/components/audio/AudioCompare').then((m) => m.AudioCompare),
  { ssr: false },
);

export function SoundSection() {
  return (
    <section
      className="relative w-full py-20 sm:py-28 px-4"
      style={{ background: 'var(--deep)' }}
    >
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Heading */}
        <motion.div
          className="text-center space-y-3"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
        >
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            The Sound of a Reef
          </h2>
          <p className="text-sm sm:text-base max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Healthy coral reefs are among the noisiest places in the ocean
          </p>
        </motion.div>

        {/* AudioCompare embed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          <AudioCompare compact className="border border-white/5 rounded-xl" />
        </motion.div>

        {/* Explanation */}
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <p className="text-sm max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Snapping shrimp, fish calls, and invertebrate activity create a rich acoustic
            signature on healthy reefs. As biodiversity declines, the soundscape falls silent
            &mdash; a measurable shift that AI can detect.
          </p>

          <Link
            href="/dashboard/compare"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
            style={{
              background: 'rgba(0, 229, 255, 0.12)',
              color: 'var(--glow-cyan)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
            }}
          >
            Explore Full Comparison
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
