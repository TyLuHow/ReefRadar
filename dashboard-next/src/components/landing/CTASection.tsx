'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Map, Info } from 'lucide-react';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';

export function CTASection() {
  return (
    <section
      className="relative w-full py-20 sm:py-28 px-4"
      style={{
        background: 'linear-gradient(180deg, var(--mid) 0%, var(--abyss) 100%)',
      }}
    >
      <div className="max-w-3xl mx-auto text-center space-y-10">
        {/* Heading */}
        <motion.h2
          className="text-3xl sm:text-4xl md:text-5xl font-bold"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
        >
          Start Listening to the Ocean
        </motion.h2>

        {/* Primary CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <Link
            href="/dashboard/analyze"
            className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-lg text-base font-bold transition-all duration-200"
            style={{
              background: 'var(--glow-green)',
              color: 'var(--abyss)',
              boxShadow: '0 0 20px rgba(0, 255, 163, 0.25)',
            }}
          >
            Analyze Audio
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg text-base font-semibold transition-all duration-200"
            style={{
              background: 'transparent',
              color: 'var(--glow-cyan)',
              border: '1.5px solid var(--glow-cyan)',
            }}
          >
            Explore Dashboard
          </Link>
        </motion.div>

        {/* Secondary links */}
        <motion.div
          className="flex items-center justify-center gap-6 text-sm"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href="/sites"
            className="inline-flex items-center gap-1.5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <Map className="w-3.5 h-3.5" />
            View Reference Sites
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center gap-1.5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <Info className="w-3.5 h-3.5" />
            Learn More
          </Link>
        </motion.div>

        {/* Caveats */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <CaveatsBanner defaultExpanded={false} />
        </motion.div>
      </div>
    </section>
  );
}
