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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-reef-primary rounded-2xl mb-4">
          <Waves className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">About ReefRadar</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          AI-powered coral reef health analysis through underwater acoustic recordings
        </p>
      </div>

      {/* API Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Server className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">API Status</span>
          </div>
          <div className="flex items-center space-x-2">
            {health?.status === 'healthy' ? (
              <>
                <CheckCircle className="w-5 h-5 text-status-healthy" />
                <span className="text-status-healthy font-medium">Operational</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-status-degraded" />
                <span className="text-status-degraded font-medium">Checking...</span>
              </>
            )}
          </div>
        </div>
        {health && (
          <div className="mt-3 text-sm text-gray-500">
            Version: {health.version || 'Unknown'} | Last checked:{' '}
            {new Date().toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* What is ReefRadar */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">What is ReefRadar?</h2>
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 leading-relaxed">
            ReefRadar is an AI-powered tool for analyzing coral reef health through
            underwater acoustic recordings. Healthy reefs produce distinct soundscapes
            from the fish, invertebrates, and other marine life that inhabit them.
            By analyzing these sounds, we can assess reef health non-invasively.
          </p>
          <p className="text-gray-600 leading-relaxed mt-4">
            The system uses machine learning to extract acoustic features from
            recordings and compare them against reference sites of known health status.
            This enables rapid, scalable reef monitoring without the need for
            physical surveys.
          </p>
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">System Architecture</h2>

        {/* Flow Diagram */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px] flex items-center justify-between py-8">
            {/* User */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-reef-light rounded-xl flex items-center justify-center">
                <Waves className="w-8 h-8 text-reef-primary" />
              </div>
              <span className="text-sm font-medium text-gray-700 mt-2">User</span>
              <span className="text-xs text-gray-500">Dashboard</span>
            </div>

            <ArrowRight className="w-6 h-6 text-gray-300" />

            {/* API Gateway */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center">
                <Cloud className="w-8 h-8 text-orange-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 mt-2">API Gateway</span>
              <span className="text-xs text-gray-500">AWS</span>
            </div>

            <ArrowRight className="w-6 h-6 text-gray-300" />

            {/* Lambda Functions */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center">
                <Server className="w-8 h-8 text-orange-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 mt-2">Lambda</span>
              <span className="text-xs text-gray-500">Router/Processor</span>
            </div>

            <ArrowRight className="w-6 h-6 text-gray-300" />

            {/* ML Inference */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center">
                <Cpu className="w-8 h-8 text-purple-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 mt-2">Inference</span>
              <span className="text-xs text-gray-500">SurfPerch</span>
            </div>

            <ArrowRight className="w-6 h-6 text-gray-300" />

            {/* Storage */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center">
                <Database className="w-8 h-8 text-green-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 mt-2">Storage</span>
              <span className="text-xs text-gray-500">S3/DynamoDB</span>
            </div>
          </div>
        </div>

        {/* Service Details */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">AWS Services</h3>
            <ul className="space-y-2 text-sm text-gray-600">
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
            <h3 className="font-semibold text-gray-900 mb-3">Processing Pipeline</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-reef-primary text-white text-xs flex items-center justify-center">1</span>
                <span>Upload WAV audio file</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-reef-primary text-white text-xs flex items-center justify-center">2</span>
                <span>Resample to 32kHz mono</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-reef-primary text-white text-xs flex items-center justify-center">3</span>
                <span>Segment into 5.0s windows</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-reef-primary text-white text-xs flex items-center justify-center">4</span>
                <span>Generate 1280-dim embeddings</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-reef-primary text-white text-xs flex items-center justify-center">5</span>
                <span>Classify via trained MLP model</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Technology Stack */}
      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">ML Model</h3>
          <p className="text-gray-600 mb-4">
            <strong>SurfPerch</strong> is an audio embedding model from Google Research,
            originally trained for bird vocalization analysis and adapted for
            underwater reef sounds.
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>Input: 32kHz mono audio, 5.0s windows</li>
            <li>Output: 1280-dimensional embeddings</li>
            <li>Framework: TensorFlow via perch-hoplite</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Reference Data</h3>
          <p className="text-gray-600 mb-4">
            Reference recordings from the <strong>MARRS</strong> (Mars Assisted Reef
            Restoration System) dataset, featuring underwater acoustic recordings
            from coral reefs.
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>Indonesia - South Sulawesi (healthy, degraded, restored)</li>
            <li>Kenya - Coastal Kenya (healthy)</li>
            <li>8 validated sites from 45-site MARRS dataset</li>
            <li>DOI: 10.5522/04/29958062 (CC BY 4.0)</li>
          </ul>
        </div>
      </div>

      {/* Methodology */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Methodology</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">What This Tool Measures</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>Biological sound production (fish, snapping shrimp, invertebrates)</li>
              <li>Acoustic diversity and complexity of soundscapes</li>
              <li>Similarity to reference sites of known health status</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">What It Cannot Measure</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>Coral tissue health or bleaching extent</li>
              <li>Specific species identification</li>
              <li>Water quality or temperature</li>
              <li>Coral coverage percentage</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="font-semibold text-gray-900 mb-2">Recommended Use</h4>
          <p className="text-sm text-gray-600">
            Acoustic monitoring is complementary to visual surveys. Results represent acoustic
            profile similarity to reference sites, not definitive health diagnosis. Soundscapes
            vary by time of day, season, and moon phase. Best used for trend monitoring and
            relative comparisons between sites.
          </p>
        </div>
      </div>

      {/* Limitations */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-amber-800 mb-4 flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2" />
          Current Limitations
        </h3>
        <ul className="space-y-2 text-sm text-amber-700">
          <li>Results are based on acoustic similarity only — combine with visual surveys for definitive assessment</li>
          <li>Model trained on Indo-Pacific reef sounds (Indonesia, Kenya, Australia, Maldives, Mexico) — Caribbean/Atlantic reefs have different soundscapes and are not validated</li>
          <li>Background noise (boats, weather, equipment) can affect accuracy</li>
          <li>Soundscapes vary by time of day, season, and lunar cycle — single recordings may not represent overall reef health</li>
          <li>Currently 8 reference sites; expanding to full 45-site MARRS dataset</li>
        </ul>
      </div>

      {/* Credits */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Credits</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-900 mb-1">ML Model</p>
            <p>SurfPerch by Google Research</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Reference Data</p>
            <p>MARRS Reef Sound Research</p>
            <p className="text-xs text-gray-500 mt-1">DOI: 10.5522/04/29958062</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Infrastructure</p>
            <p>AWS Cloud Services</p>
          </div>
        </div>
      </div>
    </div>
  );
}
