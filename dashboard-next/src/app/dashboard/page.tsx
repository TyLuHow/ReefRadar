'use client';

import Link from 'next/link';
import { Upload, GitCompare, MapPin, Compass, Waves, Globe2 } from 'lucide-react';
import { GlowCard } from '@/components/ui/GlowCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { useLegacySitesResponse } from '@/features/contract';
import { deriveSiteStats } from '@/lib/site-stats';

export default function DashboardHomePage() {
  const { data: sitesData } = useLegacySitesResponse();
  const stats = deriveSiteStats(sitesData);

  const cards = [
    {
      href: '/dashboard/analyze',
      icon: Upload,
      title: 'Analyze Audio',
      desc: 'Upload a recording to see which labelled reference reefs it most resembles',
      glow: '#cd853f',
    },
    {
      href: '/dashboard/compare',
      icon: GitCompare,
      title: 'Audio Comparison',
      desc: 'Hear the difference between healthy and degraded reefs side by side',
      glow: '#8b7355',
    },
    {
      href: '/dashboard/map',
      icon: MapPin,
      title: 'Site Map',
      desc: 'Explore reference sites on an interactive map',
      glow: '#e9dcc9',
    },
    {
      href: '/sites',
      icon: Compass,
      title: 'Reference Sites',
      desc: sitesData
        ? `Browse ${stats.total} reference sites across ${stats.countryCount} countries`
        : 'Browse the reference sites',
      glow: '#c08081',
    },
  ];

  const quickStats = [
    { value: stats.total, label: 'Reference Sites', icon: Compass, glow: '#cd853f' },
    { value: stats.countryCount, label: 'Countries', icon: Globe2, glow: '#8b7355' },
    { value: stats.labelCategoryCount, label: 'Dataset Label Categories', icon: Waves, glow: '#e9dcc9' },
  ];

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
          Acoustic similarity to labelled reference reefs: upload a recording, explore
          the reference sites, and compare recordings.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        {quickStats.map((s, i) => (
          <div key={i} className="text-center">
            <s.icon className="w-5 h-5 mx-auto mb-1" style={{ color: s.glow }} />
            <div className="text-2xl font-bold" style={{ color: s.glow }}>
              {sitesData ? <AnimatedCounter target={s.value} duration={1500} /> : '—'}
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
                className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
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
