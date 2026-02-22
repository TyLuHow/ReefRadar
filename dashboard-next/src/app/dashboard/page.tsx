'use client';

import Link from 'next/link';
import { Upload, GitCompare, MapPin, Compass, Waves, Globe2 } from 'lucide-react';
import { GlowCard } from '@/components/ui/GlowCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

const cards = [
  {
    href: '/dashboard/analyze',
    icon: Upload,
    title: 'Analyze Audio',
    desc: 'Upload underwater recordings for AI-powered reef health classification',
    glow: 'var(--glow-green)',
  },
  {
    href: '/dashboard/compare',
    icon: GitCompare,
    title: 'Audio Comparison',
    desc: 'Hear the difference between healthy and degraded reefs side by side',
    glow: 'var(--glow-cyan)',
  },
  {
    href: '/dashboard/map',
    icon: MapPin,
    title: 'Site Map',
    desc: 'Explore reference sites on an interactive map',
    glow: 'var(--glow-gold)',
  },
  {
    href: '/sites',
    icon: Compass,
    title: 'Reference Sites',
    desc: 'Browse the 8 reference sites across Indonesia and Kenya',
    glow: 'var(--glow-coral)',
  },
];

const quickStats = [
  { value: 8, label: 'Reference Sites', icon: Compass, glow: 'var(--glow-cyan)' },
  { value: 2, label: 'Countries', icon: Globe2, glow: 'var(--glow-green)' },
  { value: 4, label: 'Health Classes', icon: Waves, glow: 'var(--glow-gold)' },
];

export default function DashboardHomePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1
          className="text-3xl sm:text-4xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Dashboard
        </h1>
        <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
          AI-powered coral reef acoustic health analysis. Upload recordings, explore
          reference sites, and compare reef soundscapes.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        {quickStats.map((s, i) => (
          <div key={i} className="text-center">
            <s.icon className="w-5 h-5 mx-auto mb-1" style={{ color: s.glow }} />
            <div className="text-2xl font-bold" style={{ color: s.glow }}>
              <AnimatedCounter target={s.value} duration={1500} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <GlowCard glowColor={card.glow} className="h-full flex items-start gap-4 hover:scale-[1.01] transition-transform duration-200">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
                style={{
                  background: `${card.glow}18`,
                  color: card.glow,
                }}
              >
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {card.desc}
                </p>
              </div>
            </GlowCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
