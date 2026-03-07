'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Waves,
  Server,
  Database,
  Cloud,
  Cpu,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Github,
  ExternalLink,
} from 'lucide-react';

export default function AboutPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

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
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>System Architecture</h2>

          {/* Flow Diagram */}
          <div className="overflow-x-auto">
            <div className="min-w-[600px] flex items-center justify-between py-8">
              {/* User */}
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(205, 133, 63, 0.15)' }}
                >
                  <Waves className="w-8 h-8 text-ochre" />
                </div>
                <span className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>User</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Dashboard</span>
              </div>

              <ArrowRight className="w-6 h-6" style={{ color: 'var(--text-dim)' }} />

              {/* API Gateway */}
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(139, 115, 85, 0.2)' }}
                >
                  <Cloud className="w-8 h-8 text-muted-tan" />
                </div>
                <span className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>API Gateway</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>AWS</span>
              </div>

              <ArrowRight className="w-6 h-6" style={{ color: 'var(--text-dim)' }} />

              {/* Lambda Functions */}
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(139, 115, 85, 0.2)' }}
                >
                  <Server className="w-8 h-8 text-muted-tan" />
                </div>
                <span className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>Lambda</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Router/Processor</span>
              </div>

              <ArrowRight className="w-6 h-6" style={{ color: 'var(--text-dim)' }} />

              {/* ML Inference */}
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(192, 128, 129, 0.2)' }}
                >
                  <Cpu className="w-8 h-8 text-dusty-rose" />
                </div>
                <span className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>Inference</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>SurfPerch</span>
              </div>

              <ArrowRight className="w-6 h-6" style={{ color: 'var(--text-dim)' }} />

              {/* Storage */}
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(233, 220, 201, 0.15)' }}
                >
                  <Database className="w-8 h-8 text-pale-gold" />
                </div>
                <span className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>Storage</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>S3/DynamoDB</span>
              </div>
            </div>
          </div>

          {/* Service Details */}
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <div>
              <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>AWS Services</h3>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-status-healthy" />
                  <span>API Gateway - HTTP API endpoint</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-status-healthy" />
                  <span>Lambda - 4 serverless functions</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-status-healthy" />
                  <span>S3 - Audio and embedding storage</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-status-healthy" />
                  <span>DynamoDB - Metadata tracking</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-status-healthy" />
                  <span>ECR - Container image registry</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Processing Pipeline</h3>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-center space-x-2">
                  <span className="w-4 h-4 rounded-full bg-ochre text-white text-xs flex items-center justify-center">1</span>
                  <span>Upload WAV audio file</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-4 h-4 rounded-full bg-ochre text-white text-xs flex items-center justify-center">2</span>
                  <span>Resample to 32kHz mono</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-4 h-4 rounded-full bg-ochre text-white text-xs flex items-center justify-center">3</span>
                  <span>Segment into 5.0s windows</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-4 h-4 rounded-full bg-ochre text-white text-xs flex items-center justify-center">4</span>
                  <span>Generate 1280-dim embeddings</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-4 h-4 rounded-full bg-ochre text-white text-xs flex items-center justify-center">5</span>
                  <span>Classify via trained MLP model</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Technology Stack */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>ML Model</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              <strong>SurfPerch</strong> is an audio embedding model from Google Research,
              originally trained for bird vocalization analysis and adapted for
              underwater reef sounds.
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Input: 32kHz mono audio, 5.0s windows</li>
              <li>Output: 1280-dimensional embeddings</li>
              <li>Framework: TensorFlow via perch-hoplite</li>
            </ul>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Reference Data</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              54 reference sites across 7 countries, combining multiple open-access
              underwater acoustic datasets including pre/post hurricane comparison.
            </p>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Indonesia, Australia, Kenya, Maldives, Mexico (MARRS dataset)</li>
              <li>USA - Florida Keys (Hurricane Irma study, NOAA SanctSound)</li>
              <li>French Polynesia - Bora-Bora (CoralSoundExplorer)</li>
              <li>DOI: 10.5522/04/29958062 (CC BY 4.0)</li>
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
                <li>Biological sound production (fish, snapping shrimp, invertebrates)</li>
                <li>Acoustic diversity and complexity of soundscapes</li>
                <li>Similarity to reference sites of known health status</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>What It Cannot Measure</h4>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>Coral tissue health or bleaching extent</li>
                <li>Specific species identification</li>
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
            <li>Model trained on reef sounds from Indonesia, Australia, Kenya, Maldives, and Mexico -- Caribbean/Atlantic reefs have different soundscapes and are not validated</li>
            <li>Background noise (boats, weather, equipment) can affect accuracy</li>
            <li>Soundscapes vary by time of day, season, and lunar cycle -- single recordings may not represent overall reef health</li>
            <li>54 reference sites across 7 countries (Indonesia, Australia, Kenya, Maldives, Mexico, USA, French Polynesia)</li>
          </ul>
        </div>

        {/* Data Sources */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Data Sources</h2>
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>MARRS Foundation</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Mars Assisted Reef Restoration System -- 45 sites across Indo-Pacific
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: 10.5522/04/29958062 | License: CC BY 4.0
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Hurricane Irma Florida Keys Dataset</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Simmons, K.R., Bohnenstiehl, D.R., &amp; Eggleston, D.B. (2020). Reef soundscapes before and after Hurricane Irma.
                Pre/post hurricane comparison at Western Dry Rocks and Eastern Sambo reef sites.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: 10.5061/dryad.5tb2rbp38 | License: CC0 (Public Domain)
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>CoralSoundExplorer Bora-Bora</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Minier, L., et al. (2025). CoralSoundExplorer: A tool for soundscape-based coral reef monitoring. PLOS Computational Biology.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                DOI: 10.5281/zenodo.14577064 | License: CC-BY 4.0
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>NOAA SanctSound</h4>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                NOAA Sanctuary Soundscape Monitoring Project -- Florida Keys National Marine Sanctuary
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                License: Public Domain (U.S. Government Work)
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
              <p>SurfPerch by Google Research</p>
            </div>
            <div>
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Reference Data</p>
              <p>MARRS Reef Sound Research</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>DOI: 10.5522/04/29958062</p>
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
