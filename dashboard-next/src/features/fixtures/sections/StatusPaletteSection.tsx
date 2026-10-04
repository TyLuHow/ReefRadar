'use client';

import { filterDeficiencyDeuter, filterDeficiencyProt, filterDeficiencyTrit, formatHex, parse, wcagContrast, type Color } from 'culori';
import { useRef } from 'react';
import { HABITAT_STATUSES, STATUS_LABELS, StatusMark, useTokens, type HabitatStatus, type TokenKey, type Tokens } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Status palette (DS-02): the five habitat statuses as the product draws them, with the numbers a
 * reviewer needs to judge them, all computed here from the live tokens. The marks take their colour
 * from the direction; the hex labels, the colour-vision simulations (culori, Machado 2009 at full
 * severity) and the contrast numbers are recomputed whenever the direction or a `?tok=` override
 * changes. culori is a development dependency and is reachable only behind the fixtures flag. The
 * pass/fail gates live in tests/unit/status-palette.test.ts; this section is for looking.
 */

export const STATUS_PALETTE_META: FixtureSectionMeta = {
  slug: 'status-palette',
  group: 'Foundation',
  kind: 'Status palette',
  title: 'Status palette',
  contract:
    'Five statuses, each a colour paired with a shape and a text label, never colour alone. Order is warm to cool, then the neutral unknown. Every mark must reach 3:1 on the grounds it sits on.',
  data: 'src/styles/tokens.css (--dir-hab-*, --dir-ground, --dir-panel, --dir-panel-hover), src/features/ui/status-shapes.ts',
};

const MARK_SIZES = [12, 16, 20, 24] as const;
const MIN_NON_TEXT_CONTRAST = 3;

const TOKEN_OF: Record<HabitatStatus, TokenKey> = {
  degraded: 'hab-degraded',
  restored_early: 'hab-restored-early',
  restored_mid: 'hab-restored-mid',
  healthy: 'hab-healthy',
  unknown: 'hab-unknown',
};

const GROUNDS = [
  { id: 'ground', label: 'Ground' },
  { id: 'panel', label: 'Panel' },
  { id: 'panel-hover', label: 'Panel hover' },
] as const;

const VISIONS = [
  { id: 'normal', label: 'Normal', simulate: null },
  { id: 'deuteranopia', label: 'Deuteranopia', simulate: filterDeficiencyDeuter(1) },
  { id: 'protanopia', label: 'Protanopia', simulate: filterDeficiencyProt(1) },
  { id: 'tritanopia', label: 'Tritanopia', simulate: filterDeficiencyTrit(1) },
] as const;

/** The status colour as the given vision sees it, as a six-digit hex. */
function simulated(hex: string, simulate: ((color: Color) => Color) | null): string {
  const color = parse(hex);
  if (color === undefined) return hex;
  return formatHex(simulate ? simulate(color) : color) ?? hex;
}

function contrast(foreground: string, background: string): number {
  return wcagContrast(foreground, background);
}

function MarksCell({ tokens }: { tokens: Tokens }) {
  return (
    <StateCell primitive="status-palette" state="marks" span="full">
      <ul className="grid gap-4">
        {HABITAT_STATUSES.map((status) => (
          <li key={status} className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-3">
              {MARK_SIZES.map((size) => (
                <StatusMark key={size} status={status} size={size} />
              ))}
            </span>
            <span className="text-body font-semibold">{STATUS_LABELS[status]}</span>
            <span className="font-data text-small text-muted">{tokens[TOKEN_OF[status]]}</span>
          </li>
        ))}
      </ul>
      <p className="text-small text-muted mt-4">{`Marks at ${MARK_SIZES.join(', ')} px. Each sits beside its label.`}</p>
    </StateCell>
  );
}

function CvdCell({ tokens }: { tokens: Tokens }) {
  return (
    <StateCell primitive="status-palette" state="cvd" span="full">
      <div className="grid gap-5">
        {VISIONS.map(({ id, label, simulate }) => (
          <div key={id} data-vision={id}>
            <p className="type-eyebrow text-muted">{label}</p>
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {HABITAT_STATUSES.map((status) => {
                const hex = simulated(tokens[TOKEN_OF[status]], simulate);
                return (
                  <li key={status}>
                    <div className="h-8 border border-rule" style={{ backgroundColor: hex }} data-swatch={status} />
                    <p className="font-data text-eyebrow mt-1">{STATUS_LABELS[status]}</p>
                    <p className="font-data text-eyebrow text-muted">{hex}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-small text-muted mt-4">Simulated with Machado 2009 at severity 1.0. A reviewer judges the five apart in every row.</p>
    </StateCell>
  );
}

function ContrastCell({ tokens }: { tokens: Tokens }) {
  return (
    <StateCell primitive="status-palette" state="contrast" span="full">
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <caption className="sr-only">Contrast of each status colour against the three grounds, as ratios to 1</caption>
          <thead>
            <tr>
              <th scope="col" className="text-start font-semibold py-2 pe-4">
                Status
              </th>
              {GROUNDS.map(({ id, label }) => (
                <th key={id} scope="col" className="text-start font-semibold py-2 pe-4">
                  {label}
                  <span className="block font-data text-eyebrow text-muted font-normal">{tokens[id]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HABITAT_STATUSES.map((status) => (
              <tr key={status} className="border-t border-rule">
                <th scope="row" className="text-start font-semibold py-2 pe-4">
                  {STATUS_LABELS[status]}
                </th>
                {GROUNDS.map(({ id }) => {
                  const ratio = contrast(tokens[TOKEN_OF[status]], tokens[id]);
                  return (
                    <td key={id} className="font-data py-2 pe-4" data-status={status} data-ground={id}>
                      {`${ratio.toFixed(2)} : 1`}
                      <span className="block text-eyebrow text-muted">{ratio >= MIN_NON_TEXT_CONTRAST ? 'reaches 3:1' : 'below 3:1'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-small text-muted mt-4">Non-text floor is 3:1. A value below it is printed as it is, not hidden.</p>
    </StateCell>
  );
}

function PaletteCells() {
  const ref = useRef<HTMLDivElement>(null);
  // The token set is read again when the direction changes or a ?tok= override is applied, and
  // every cell below is recomputed from it. `contents` keeps the cells in the section's own grid.
  const { tokens } = useTokens(ref);
  return (
    <div ref={ref} className="contents">
      {tokens === null ? (
        <p className="col-span-full text-small text-muted">Reading the live tokens.</p>
      ) : (
        <>
          <MarksCell tokens={tokens} />
          <CvdCell tokens={tokens} />
          <ContrastCell tokens={tokens} />
        </>
      )}
    </div>
  );
}

export function StatusPaletteSection() {
  return (
    <FixtureSection {...STATUS_PALETTE_META}>
      <PaletteCells />
    </FixtureSection>
  );
}
