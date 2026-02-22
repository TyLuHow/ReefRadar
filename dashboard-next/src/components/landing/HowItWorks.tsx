'use client';

import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Inline SVG icons (no external images)                              */
/* ------------------------------------------------------------------ */

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2l3-9 4 18 4-18 3 9h2" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 0-4 4c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2 4 4 0 0 0-4-4Z" />
      <path d="M8 8v2a4 4 0 0 0 8 0V8" />
      <circle cx="9" cy="15" r="1" />
      <circle cx="15" cy="15" r="1" />
      <path d="M9 16v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3" />
      <path d="M6 10a6 6 0 0 0 0 8" />
      <path d="M18 10a6 6 0 0 1 0 8" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
      <line x1="2" x2="22" y1="20" y2="20" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Steps data                                                         */
/* ------------------------------------------------------------------ */

const steps = [
  {
    icon: MicIcon,
    title: 'Record',
    desc: 'Underwater recording captured',
    color: 'var(--glow-cyan)',
  },
  {
    icon: WaveformIcon,
    title: 'Segment',
    desc: 'Audio segmented into 5-second windows',
    color: 'var(--glow-green)',
  },
  {
    icon: BrainIcon,
    title: 'Extract',
    desc: 'SurfPerch AI extracts 1,280 acoustic features',
    color: 'var(--glow-gold)',
  },
  {
    icon: ChartIcon,
    title: 'Classify',
    desc: 'Trained classifier determines reef health',
    color: 'var(--glow-coral)',
  },
  {
    icon: GlobeIcon,
    title: 'Adjust',
    desc: 'Geographic region adjusts confidence',
    color: 'var(--glow-cyan)',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HowItWorks() {
  return (
    <section
      className="relative w-full py-20 sm:py-28 px-4 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, var(--deep) 0%, var(--mid) 100%)',
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-16"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
        >
          How ReefRadar Works
        </motion.h2>

        {/* Pipeline — vertical on mobile, horizontal on md+ */}
        <div className="relative flex flex-col md:flex-row items-stretch md:items-start gap-6 md:gap-0">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="relative flex flex-col items-center text-center flex-1"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
            >
              {/* Connector line (except first) */}
              {i > 0 && (
                <>
                  {/* Horizontal connector (md+) */}
                  <div
                    className="hidden md:block absolute top-8 right-1/2 w-full h-px"
                    style={{ background: `linear-gradient(to right, ${steps[i - 1].color}44, ${step.color}44)` }}
                  />
                  {/* Vertical connector (mobile) */}
                  <div
                    className="md:hidden absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3"
                    style={{ background: step.color, opacity: 0.3 }}
                  />
                </>
              )}

              {/* Icon circle */}
              <div
                className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{
                  background: `${step.color}18`,
                  border: `1.5px solid ${step.color}55`,
                  color: step.color,
                }}
              >
                <step.icon />
              </div>

              {/* Text */}
              <h3 className="text-sm font-bold mb-1" style={{ color: step.color }}>
                {step.title}
              </h3>
              <p className="text-xs leading-relaxed max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Model performance */}
        <motion.p
          className="text-center mt-14 text-sm tracking-wide"
          style={{ color: 'var(--text-dim)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          AUC-ROC 0.933&ensp;|&ensp;Trained on 45 sites across 5 countries&ensp;|&ensp;8 reference sites currently deployed
        </motion.p>
      </div>
    </section>
  );
}
