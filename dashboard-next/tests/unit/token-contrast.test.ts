// @vitest-environment node
/**
 * Contrast gate (04-04): the UI-SPEC "Contrast numbers per direction" pair table as a test over the
 * parsed tokens.css, for every direction. Floors: text 4.5:1, non-text 3:1. A failing direction
 * cannot ship; the failure names the pair and the measured ratio.
 */
import { parse, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, parseDirectionTokens } from './support/tokens-css';

const TOKENS = parseDirectionTokens();

/** [foreground token, background token], names without the `--dir-` prefix. */
type Pair = [string, string];

const TEXT_PAIRS: Pair[] = [
  ['ink', 'ground'],
  ['ink', 'panel'],
  ['muted', 'ground'],
  ['muted', 'panel'],
  ['muted', 'panel-hover'],
  ['muted', 'selected'],
  ['accent', 'ground'],
  ['accent', 'panel'],
  ['on-control', 'control'],
  ['on-control', 'control-hover'],
  ['on-band', 'band'],
  ['on-band-muted', 'band'],
  ['on-accent-block', 'accent-block'],
  ['on-block-alt', 'block-alt'],
  ['on-inverse', 'inverse'],
  ['well-ink', 'well'],
  ['well-muted', 'well'],
];

const NON_TEXT_PAIRS: Pair[] = [
  ['focus', 'ground'],
  ['focus', 'panel'],
  ['rule-strong', 'ground'],
  ['rule-strong', 'panel'],
  ['well-rule', 'well'],
  ['focus-on-well', 'well'],
  ['focus-on-accent', 'accent-block'],
  ['playhead', 'well'],
];

function measure(direction: (typeof DIRECTIONS)[number], [fg, bg]: Pair): { ratio: number; fgHex: string; bgHex: string } {
  const fgHex = TOKENS[direction][`--dir-${fg}`];
  const bgHex = TOKENS[direction][`--dir-${bg}`];
  if (!fgHex) throw new Error(`${direction}: --dir-${fg} is not defined`);
  if (!bgHex) throw new Error(`${direction}: --dir-${bg} is not defined`);
  const a = parse(fgHex);
  const b = parse(bgHex);
  if (!a || !b) throw new Error(`${direction}: ${fg} (${fgHex}) or ${bg} (${bgHex}) is not a colour`);
  return { ratio: wcagContrast(a, b), fgHex, bgHex };
}

describe.each(DIRECTIONS)('contrast: %s', (direction) => {
  it.each(TEXT_PAIRS.map((p) => ({ name: `${p[0]} on ${p[1]}`, pair: p })))('text $name reaches 4.5:1', ({ name, pair }) => {
    const { ratio, fgHex, bgHex } = measure(direction, pair);
    expect(ratio, `${direction}: ${name} (${fgHex} on ${bgHex}) measures ${ratio.toFixed(2)}:1, needs 4.50`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS.map((p) => ({ name: `${p[0]} on ${p[1]}`, pair: p })))('non-text $name reaches 3:1', ({ name, pair }) => {
    const { ratio, fgHex, bgHex } = measure(direction, pair);
    expect(ratio, `${direction}: ${name} (${fgHex} on ${bgHex}) measures ${ratio.toFixed(2)}:1, needs 3.00`).toBeGreaterThanOrEqual(3);
  });
});
