'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getCitation, formatCitation } from '@/lib/citations';
import { deriveSiteStats, formatList } from '@/lib/site-stats';
import modelCard from '@/data/model-card.json';
import { Waves, Server, CheckCircle, AlertTriangle } from 'lucide-react';
import { ArchitectureDiagram } from '@/components/about/ArchitectureDiagram';

export default function AboutPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.getSites(),
    staleTime: 60_000,
  });
  const stats = deriveSiteStats(sitesData);

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, var(--bg-abyss) 0%, var(--bg-depths) 40%, var(--bg-surface) 100%)' }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgba(205, 133, 63, 0.2)' }}
          >
            <Waves className="w-8 h-8 text-ochre" />
          </div>
          <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>About ReefRadar</h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            AI-powered coral reef health analysis through underwater acoustic recordings
          </p>
        </div>

        {/* API Status */}
        <div className="glass-panel p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Server className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>API Status</span>
            </div>
            <div className="flex items-center space-x-2">
              {health?.status === 'healthy' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-status-healthy" />
                  <span className="text-status-healthy font-medium">Operational</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--accent-warning)' }} />
                  <span className="font-medium" style={{ color: 'var(--accent-warning)' }}>Checking...</span>
                </>
              )}
            </div>
          </div>
          {health && (
            <div className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              Version: {health.version || 'Unknown'} | Last checked:{' '}
              {new Date().toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* What is ReefRadar */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>What is ReefRadar?</h2>
          <div className="max-w-none">
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              ReefRadar is an AI-powered tool for analyzing coral reef health through
              underwater acoustic recordings. Healthy reefs produce distinct soundscapes
              from the fish, invertebrates, and other marine life that inhabit them.
              By analyzing these sounds, we can assess reef health non-invasively.
            </p>
            <p className="leading-relaxed mt-4" style={{ color: 'var(--text-secondary)' }}>
              The system uses machine learning to extract acoustic features from
              recordings and compare them against reference sites of known health status.
              This enables rapid, scalable reef monitoring without the need for
              physical surveys.
            </p>
          </div>
        </div>

        {/* Architecture Diagram */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>System Architecture</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Fully serverless on AWS · us-east-1 · 12 resources
          </p>
          <ArchitectureDiagram />
        </div>

        {/* Technology Stack */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>ML Model</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              <strong>SurfPerch</strong> ({formatCitation('surfperch', 'short')}) is an audio
              embedding model pre-trained on reef, bird and general audio, used here to
              extract acoustic features from underwater reef recordings.
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Input: 32kHz mono audio, 5.0s windows</li>
              <li>Output: 1280-dimensional embeddings</li>
              <li>Framework: TensorFlow via perch-hoplite</li>
              <li>Paper: {getCitation('surfperch').url}</li>
            </ul>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Reference Data</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              {sitesData
                ? `${stats.total} reference sites across ${stats.countryCount} countries, combining multiple open-access underwater acoustic datasets including a pre/post-hurricane comparison.`
                : 'Reference sites combining multiple open-access underwater acoustic datasets including a pre/post-hurricane comparison.'}
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Indonesia, Australia, Kenya, Maldives, Mexico ({formatCitation('marrs', 'short')})</li>
              <li>USA -- Florida Keys ({formatCitation('irma', 'short')}, {getCitation('sanctsound').short})</li>
              <li>French Polynesia -- Bora-Bora ({formatCitation('coralsoundexplorer', 'short')})</li>
              <li>DOI: {getCitation('marrs').doi} ({getCitation('marrs').licence})</li>
            </ul>
          </div>
        </div>

        {/* Methodology */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Methodology</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>What This Tool Measures</h4>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>SurfPerch acoustic features extracted from 5-second recording windows</li>
                <li>Acoustic similarity to labelled reference recordings</li>
                <li>Probabilities from a small exploratory classifier trained on real reef recordings</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>What It Cannot Measure</h4>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>Coral tissue health or bleaching extent</li>
                <li>Specific species identification</li>
                <li>Definitive reef health diagnosis</li>
                <li>Water quality or temperature</li>
                <li>Coral coverage percentage</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
            <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Recommended Use</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Acoustic monitoring is complementary to visual surveys. Results represent acoustic
              profile similarity to reference sites, not definitive health diagnosis. Soundscapes
              vary by time of day, season, and moon phase. Best used for trend monitoring and
              relative comparisons between sites.
            </p>
          </div>
        </div>

        {/* Limitations */}
        <div
          className="rounded-xl p-6 mb-8"
          style={{ background: 'rgba(184, 134, 11, 0.1)', border: '1px solid rgba(184, 134, 11, 0.3)' }}
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center" style={{ color: '#b8860b' }}>
            <AlertTriangle className="w-5 h-5 mr-2" />
            Current Limitations
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: 'rgba(184, 134, 11, 0.85)' }}>
            <li>Results are based on acoustic similarity only -- combine with visual surveys for definitive assessment</li>
            <li>
              Classifier version {modelCard.model_version}, trained on {modelCard.training_rows} recordings
              from {modelCard.training_sites_count} real sites in {formatList(modelCard.training_countries)} --
              not validated on new sites or regions
            </li>
            <li>{modelCard.evaluation_note}</li>
            <li>Background noise (boats, weather, equipment) can affect accuracy</li>
            <li>Soundscapes vary by time of day, season, and lunar cycle -- single recordings may not represent overall reef health</li>
            <li>
              {sitesData
                ? `${stats.total} reference sites across ${stats.countryCount} countries (${formatList(stats.countries)})`
                : 'Reference site counts are loading...'}
            </li>
          </ul>
        </div>

        {/* Data Sources */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Data Sources</h2>
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>MARRS Foundation</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Mars Assisted Reef Restoration System -- 45 sites in Indonesia, Australia,
                Kenya, Maldives and Mexico ({formatCitation('marrs', 'short')})
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: {getCitation('marrs').doi} | License: {getCitation('marrs').licence}
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{getCitation('irma').title}</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                {formatCitation('irma', 'short')}. Pre/post hurricane comparison at Western
                Dry Rocks and Eastern Sambo reef sites.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: {getCitation('irma').doi} | License: {getCitation('irma').licence}
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>CoralSoundExplorer Bora-Bora</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                {formatCitation('coralsoundexplorer', 'short')}. {getCitation('coralsoundexplorer').title}.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: {getCitation('coralsoundexplorer').doi} | License: {getCitation('coralsoundexplorer').licence}
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{getCitation('sanctsound').title}</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                {getCitation('sanctsound').publisher} -- Florida Keys National Marine Sanctuary
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                License: {getCitation('sanctsound').licence}
              </p>
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Credits</h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>ML Model</p>
              <p>{formatCitation('surfperch', 'short')}</p>
            </div>
            <div>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Reference Data</p>
              <p>{formatCitation('marrs', 'short')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>DOI: {getCitation('marrs').doi}</p>
            </div>
            <div>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Infrastructure</p>
              <p>AWS Cloud Services</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
