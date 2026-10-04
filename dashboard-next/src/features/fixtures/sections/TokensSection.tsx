'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, findSurfaceRoot, useReducedMotion, useTokens } from '@/features/ui';
import { FixtureSection, useFixtureChrome, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Tokens (DS-01, DS-06): type, spacing, surfaces, rules, focus, motion and the current direction,
 * read from the live tokens. Nothing here states a value: a swatch is painted by the token's own
 * utility class and labelled with the hex the browser resolved for `--dir-*`; a size or a duration
 * is labelled with its computed style. Switching the direction, the reduced-motion toggle or a
 * `?tok=` override therefore changes both the specimen and its label.
 */

export const TOKENS_META: FixtureSectionMeta = {
  slug: 'tokens',
  group: 'Foundation',
  kind: 'Tokens',
  title: 'Tokens',
  contract:
    'Every value on this page is read from src/styles/tokens.css for the active direction. Components name a semantic token, never a hex, a font or a pixel radius, so a direction is one token set.',
  data: 'src/styles/tokens.css (--dir-*, --rule-w*, --duration-*), computed from the live surface root',
};

/** Custom properties of the surface root, trimmed and read again when the direction, an override or reduced motion changes. */
function useCustomProperties(ref: RefObject<HTMLElement | null>, names: readonly string[]): Record<string, string> {
  const { version } = useTokens(ref);
  const osReduced = useReducedMotion(ref);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const surface = findSurfaceRoot(ref.current);
    if (surface === null) return;
    const read = () => {
      const style = getComputedStyle(surface);
      setValues(Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()])));
    };
    read();
  }, [ref, names, version, osReduced]);

  return values;
}

/** Computed style of every `[data-measure]` element below `ref`, keyed by its data-measure value and read through its data-prop. */
function useMeasured(ref: RefObject<HTMLElement | null>): Record<string, string> {
  const { version } = useTokens(ref);
  const osReduced = useReducedMotion(ref);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const container = ref.current;
    if (container === null) return;
    const read = () => {
      const next: Record<string, string> = {};
      for (const element of container.querySelectorAll<HTMLElement>('[data-measure]')) {
        const raw = getComputedStyle(element).getPropertyValue(element.dataset.prop ?? '').trim();
        const px = /^(-?\d+(?:\.\d+)?)px$/.exec(raw);
        next[element.dataset.measure ?? ''] = px ? `${Math.round(Number(px[1]) * 10) / 10}px` : raw;
      }
      setValues(next);
    };
    read();
  }, [ref, version, osReduced]);

  return values;
}

const DISPLAY_TIERS = [
  { id: 'display-xl', className: 'type-display text-display-xl', word: 'Listen' },
  { id: 'display-l', className: 'type-display text-display-l', word: 'Compare' },
  { id: 'display-m', className: 'type-display text-display-m', word: 'Explore' },
] as const;

const FIXED_ROLES = [
  { id: 'eyebrow', className: 'type-eyebrow', label: 'Eyebrow' },
  { id: 'small', className: 'font-body text-small', label: 'Small' },
  { id: 'body', className: 'font-body text-body', label: 'Body' },
  { id: 'lead', className: 'font-display text-lead', label: 'Lead' },
  { id: 'title', className: 'font-numeral text-title font-semibold', label: 'Wordmark' },
  { id: 'h2', className: 'font-display text-h2', label: 'H2' },
  { id: 'id', className: 'font-data text-id', label: 'Mono id' },
] as const;

function TypeScaleCell() {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useMeasured(ref);
  return (
    <StateCell primitive="tokens" state="type-scale" span="full">
      <div ref={ref} className="grid gap-6">
        <div className="grid gap-4">
          {DISPLAY_TIERS.map(({ id, className, word }) => (
            <div key={id}>
              <p className={`${className} [overflow-wrap:anywhere]`} data-measure={id} data-prop="font-size">
                {word}
              </p>
              <p className="font-data text-eyebrow text-muted mt-1">{`${id} · ${measured[id] ?? ''}`}</p>
            </div>
          ))}
          <div>
            <p className="font-numeral text-numeral [overflow-wrap:anywhere]" data-measure="numeral" data-prop="font-size">
              0123
            </p>
            <p className="font-data text-eyebrow text-muted mt-1">{`numeral · ${measured.numeral ?? ''}`}</p>
          </div>
        </div>
        <div className="grid gap-3">
          {FIXED_ROLES.map(({ id, className, label }) => (
            <div key={id} className="flex flex-wrap items-baseline gap-x-4">
              <p className={className} data-measure={id} data-prop="font-size">
                {label}
              </p>
              <p className="font-data text-eyebrow text-muted">{`${id} · ${measured[id] ?? ''}`}</p>
            </div>
          ))}
        </div>
      </div>
    </StateCell>
  );
}

const SPACING_STEPS = [
  { step: 1, className: 'w-1' },
  { step: 2, className: 'w-2' },
  { step: 3, className: 'w-3' },
  { step: 4, className: 'w-4' },
  { step: 5, className: 'w-5' },
  { step: 6, className: 'w-6' },
  { step: 8, className: 'w-8' },
  { step: 10, className: 'w-10' },
  { step: 12, className: 'w-12' },
  { step: 16, className: 'w-16' },
  { step: 20, className: 'w-20' },
  { step: 24, className: 'w-24' },
] as const;

function SpacingCell() {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useMeasured(ref);
  return (
    <StateCell primitive="tokens" state="spacing">
      <div ref={ref} className="grid gap-2">
        {SPACING_STEPS.map(({ step, className }) => (
          <div key={step} className="flex items-center gap-3">
            <p className="font-data text-eyebrow text-muted w-28 shrink-0">{`step ${step} · ${measured[`space-${step}`] ?? ''}`}</p>
            <div className={`${className} h-3 bg-ink`} data-measure={`space-${step}`} data-prop="width" />
          </div>
        ))}
      </div>
    </StateCell>
  );
}

const SURFACES = [
  { name: 'ground', className: 'bg-ground' },
  { name: 'panel', className: 'bg-panel' },
  { name: 'panel-hover', className: 'bg-panel-hover' },
  { name: 'selected', className: 'bg-selected' },
  { name: 'track', className: 'bg-track' },
  { name: 'well', className: 'bg-well' },
  { name: 'well-raised', className: 'bg-well-raised' },
  { name: 'band', className: 'bg-band' },
  { name: 'accent-block', className: 'bg-accent-block' },
  { name: 'block-alt', className: 'bg-block-alt' },
] as const;

const SURFACE_PROPERTIES = SURFACES.map(({ name }) => `--dir-${name}`);

function SurfacesCell() {
  const ref = useRef<HTMLDivElement>(null);
  const properties = useCustomProperties(ref, SURFACE_PROPERTIES);
  return (
    <StateCell primitive="tokens" state="surfaces" span="full">
      <div ref={ref} className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {SURFACES.map(({ name, className }) => (
          <div key={name}>
            <div className={`${className} h-12 border border-rule`} />
            <p className="font-data text-eyebrow mt-2">{name}</p>
            <p className="font-data text-eyebrow text-muted">{properties[`--dir-${name}`] ?? ''}</p>
          </div>
        ))}
      </div>
    </StateCell>
  );
}

const RULES = [
  { id: 'rule', className: 'border-t-(length:--rule-w) border-solid border-rule' },
  { id: 'rule-strong', className: 'border-t-(length:--rule-w) border-solid border-rule-strong' },
  { id: 'rule-heavy', className: 'border-t-(length:--rule-w-heavy) border-solid border-rule-heavy' },
] as const;

function RulesCell() {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useMeasured(ref);
  return (
    <StateCell primitive="tokens" state="rules">
      <div ref={ref} className="grid gap-5">
        {RULES.map(({ id, className }) => (
          <div key={id}>
            <div className={className} data-measure={id} data-prop="border-top-width" />
            <p className="font-data text-eyebrow text-muted mt-2">{`${id} · ${measured[id] ?? ''}`}</p>
          </div>
        ))}
      </div>
    </StateCell>
  );
}

function FocusCell() {
  return (
    <StateCell primitive="tokens" state="focus" forced>
      <div className="grid gap-4">
        <div>
          <Button variant="secondary" data-force-focus="true">
            On ground
          </Button>
          <p className="font-data text-eyebrow text-muted mt-2">focus</p>
        </div>
        <div className="bg-well p-4">
          <Button variant="inverse" tone="well" data-force-focus="true">
            In a well
          </Button>
          <p className="font-data text-eyebrow text-well-muted mt-2">focus-on-well</p>
        </div>
        <div className="bg-accent-block p-4">
          <Button variant="inverse" tone="accent" data-force-focus="true">
            On an accent block
          </Button>
          <p className="font-data text-eyebrow text-on-accent-block mt-2">focus-on-accent</p>
        </div>
      </div>
    </StateCell>
  );
}

/** The CSS minifier writes 0ms as 0s and 200ms as .2s; durations are shown in milliseconds, as authored. */
function inMilliseconds(value: string): string {
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(value);
  if (match === null) return value;
  const amount = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return `${Math.round(amount * 100) / 100}ms`;
}

const MOTION_PROPERTIES = ['--duration-fast', '--duration-base', '--duration-morph', '--duration-view', '--ease'] as const;

function MotionCell() {
  const ref = useRef<HTMLDivElement>(null);
  const properties = useCustomProperties(ref, MOTION_PROPERTIES);
  const { reduced } = useFixtureChrome();
  const osReduced = useReducedMotion(ref);
  return (
    <StateCell primitive="tokens" state="motion">
      <div ref={ref} className="grid gap-2">
        {MOTION_PROPERTIES.map((name) => (
          <p key={name} className="font-data text-small">
            <span className="text-muted">{`${name} `}</span>
            {name === '--ease' ? (properties[name] ?? '') : inMilliseconds(properties[name] ?? '')}
          </p>
        ))}
        <p className="text-small text-muted mt-2">
          {reduced || osReduced
            ? 'Reduced motion is on: every duration reads 0ms and nothing animates.'
            : 'Reduced motion is off. Turn it on in the toolbar and every duration reads 0ms.'}
        </p>
      </div>
    </StateCell>
  );
}

const DIRECTION_PROPERTIES = [
  '--rule-w',
  '--rule-w-heavy',
  '--focus-w',
  '--mark-outline-w',
  '--space-block',
  '--gutter',
  '--dir-radius-surface',
  '--dir-radius-control',
  '--display-style',
  '--display-case',
] as const;

function DirectionCell() {
  const ref = useRef<HTMLDivElement>(null);
  const properties = useCustomProperties(ref, DIRECTION_PROPERTIES);
  const { direction } = useFixtureChrome();
  return (
    <StateCell primitive="tokens" state="direction">
      <div ref={ref} className="grid gap-2">
        <p className="font-numeral text-lead">{direction}</p>
        {DIRECTION_PROPERTIES.map((name) => (
          <p key={name} className="font-data text-small">
            <span className="text-muted">{`${name} `}</span>
            {properties[name] ?? ''}
          </p>
        ))}
      </div>
    </StateCell>
  );
}

export function TokensSection() {
  return (
    <FixtureSection {...TOKENS_META}>
      <TypeScaleCell />
      <SpacingCell />
      <SurfacesCell />
      <RulesCell />
      <FocusCell />
      <MotionCell />
      <DirectionCell />
    </FixtureSection>
  );
}
