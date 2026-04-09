'use client';

import { useState } from 'react';
import { Cloud, Server, Database, HardDrive, Package, Cpu, Users } from 'lucide-react';

interface NodeSpec {
  icon: React.ElementType;
  label: string;
  sub: string;
  tooltip: string;
  variant?: 'container' | 'default';
}

const LAMBDA_NODES: NodeSpec[] = [
  {
    icon: Server,
    label: 'Router',
    sub: '256 MB · 30s',
    tooltip: 'Entry point. Routes requests, invokes pipeline functions, reads/writes DynamoDB metadata.',
  },
  {
    icon: Server,
    label: 'Preprocessor',
    sub: '1024 MB · 180s',
    tooltip: 'Reads WAV via struct, resamples to 32kHz mono, segments into 5.0s windows, uploads chunks to S3.',
  },
  {
    icon: Server,
    label: 'Classifier',
    sub: '512 MB · 120s',
    tooltip: 'Trained MLP (1280→256→64→4, ~90% test accuracy). Applies geographic region confidence adjustment.',
  },
  {
    icon: Cpu,
    label: 'Inference',
    sub: '3008 MB · Container',
    tooltip: 'Generates 1280-dim SurfPerch embeddings via TensorFlow. Deployed as container image from ECR.',
    variant: 'container',
  },
];

const STORAGE_NODES: NodeSpec[] = [
  {
    icon: HardDrive,
    label: 'S3 Audio',
    sub: 'reefradar-2477-audio',
    tooltip: 'Stores uploaded WAV files. Preprocessor reads from here during pipeline execution.',
  },
  {
    icon: HardDrive,
    label: 'S3 Embeddings',
    sub: 'reefradar-2477-embeddings',
    tooltip: '54 pre-computed 1280-dim reference embeddings across 7 countries for cosine similarity comparison.',
  },
  {
    icon: Database,
    label: 'DynamoDB',
    sub: 'PAY_PER_REQUEST · 72 items',
    tooltip: 'Tracks uploads and analyses. Schema: pk=UPLOAD#uuid / ANALYSIS#uuid, sk=METADATA/RESULT/ERROR.',
  },
];

const BUILD_NODES: NodeSpec[] = [
  {
    icon: Package,
    label: 'ECR',
    sub: 'inference + preprocessor',
    tooltip: 'Two container image repositories: reefradar-2477-inference and reefradar-2477-preprocessor.',
  },
  {
    icon: Server,
    label: 'CodeBuild',
    sub: 'reefradar-2477-inference-build',
    tooltip: 'Builds and pushes the SurfPerch inference container from source in S3 artifacts bucket.',
  },
];

function ServiceNode({ node }: { node: NodeSpec }) {
  const [hovered, setHovered] = useState(false);
  const Icon = node.icon;
  const isContainer = node.variant === 'container';

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-center cursor-default transition-colors duration-150"
        style={{
          minWidth: '96px',
          background: hovered ? 'rgba(205, 133, 63, 0.1)' : 'var(--glass-bg)',
          border: `1px solid ${hovered ? 'rgba(205, 133, 63, 0.35)' : 'var(--glass-border)'}`,
        }}
      >
        <Icon
          className="w-4 h-4 shrink-0"
          style={{ color: isContainer ? 'var(--status-restoring-mid)' : 'var(--text-muted)' }}
        />
        <span className="text-xs font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
          {node.label}
        </span>
        <span className="text-[10px] leading-tight" style={{ color: 'var(--text-dim)' }}>
          {node.sub}
        </span>
      </div>

      {hovered && (
        <div
          className="absolute z-20 bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 rounded-lg px-3 py-2 text-[11px] leading-relaxed pointer-events-none shadow-xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--glass-border-bright)',
            color: 'var(--text-secondary)',
          }}
        >
          {node.tooltip}
          {/* caret */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid var(--glass-border-bright)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function StepConnector({ step, note }: { step: number; note: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <div className="w-px h-2.5" style={{ background: 'var(--text-dim)' }} />
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{
          background: 'rgba(205, 133, 63, 0.12)',
          border: '1px solid rgba(205, 133, 63, 0.25)',
          color: 'var(--status-healthy)',
        }}
      >
        <span
          className="w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
          style={{ background: '#cd853f', color: '#0f0d0b' }}
        >
          {step}
        </span>
        {note}
      </div>
      <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
        <path d="M4 5 L0 0 L8 0 Z" fill="var(--text-dim)" />
      </svg>
    </div>
  );
}

function LayerGroup({
  label,
  tint,
  children,
}: {
  label: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: tint, border: '1px dashed var(--glass-border)' }}
    >
      <div
        className="text-[9px] uppercase tracking-[0.18em] font-medium mb-3"
        style={{ color: 'var(--text-dim)' }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="space-y-0.5 select-none" role="img" aria-label="ReefRadar AWS architecture diagram">

      {/* Client */}
      <LayerGroup label="Client" tint="rgba(139, 115, 85, 0.06)">
        <div className="flex justify-center">
          <div
            className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-lg"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <Users className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Browser</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Dashboard · API calls</span>
          </div>
        </div>
      </LayerGroup>

      <StepConnector step={1} note="HTTPS upload + analyze" />

      {/* Networking */}
      <LayerGroup label="Networking · us-east-1" tint="rgba(120, 80, 160, 0.05)">
        <div className="flex justify-center">
          <div
            className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-lg"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <Cloud className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>API Gateway</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>HTTP · reefradar-2477-api</span>
          </div>
        </div>
      </LayerGroup>

      <StepConnector step={2} note="Route to Lambda" />

      {/* Compute */}
      <LayerGroup label="Compute — 4 × Lambda" tint="rgba(205, 133, 63, 0.05)">
        <div className="flex flex-wrap gap-2 justify-center">
          {LAMBDA_NODES.map((node) => (
            <ServiceNode key={node.label} node={node} />
          ))}
        </div>
        <p className="text-[10px] text-center mt-2.5" style={{ color: 'var(--text-dim)' }}>
          Router → Preprocessor → Classifier → Inference (sequential async invocations)
        </p>
      </LayerGroup>

      <StepConnector step={3} note="Read / write" />

      {/* Storage */}
      <LayerGroup label="Storage" tint="rgba(70, 130, 90, 0.05)">
        <div className="flex flex-wrap gap-2 justify-center">
          {STORAGE_NODES.map((node) => (
            <ServiceNode key={node.label} node={node} />
          ))}
        </div>
      </LayerGroup>

      {/* ML/Build — separated visually, not in the request path */}
      <div className="pt-4">
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: 'rgba(80, 150, 180, 0.04)',
            border: '1px dashed var(--glass-border)',
          }}
        >
          <div
            className="text-[9px] uppercase tracking-[0.18em] font-medium mb-3"
            style={{ color: 'var(--text-dim)' }}
          >
            ML / Build Pipeline
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {BUILD_NODES.map((node) => (
              <ServiceNode key={node.label} node={node} />
            ))}
          </div>
          <p className="text-[10px] text-center mt-2.5" style={{ color: 'var(--text-dim)' }}>
            CodeBuild compiles inference container → ECR → deployed as Inference Lambda
          </p>
        </div>
      </div>

      <div
        className="flex justify-end pt-2 text-[10px]"
        style={{ color: 'var(--text-dim)' }}
      >
        Hover nodes for specs
      </div>
    </div>
  );
}
