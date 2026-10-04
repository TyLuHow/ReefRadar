// @vitest-environment node
/**
 * DS-02 palette gate (04-04). Parses src/styles/tokens.css for every direction and asserts the
 * status palette rules mechanically, so a palette change that breaks colour-vision separation,
 * lightness order or the 3:1 mark floor fails CI and prints the measured numbers.
 *
 * Rules (UI-SPEC "Status palette (DS-02)", "Ink-outline rule"):
 *  - every mark fill reaches 3:1 on `ground` and `panel`;
 *  - every mark carries the `mark-outline` ink outline, and that boundary reaches 3:1 on ground,
 *    panel, panel-hover and selected. Where the outline is not a contrast carrier (a dark direction
 *    draws the outline in the ground colour only to separate overlapping marks) the fill must reach
 *    3:1 on that ground instead;
 *  - the five tones stay at least 15 CIEDE2000 apart under normal, protanopia, deuteranopia and
 *    tritanopia simulation (Machado 2009, severity 1);
 *  - adjacent ordinal tones differ by at least 9 L*, warm tones precede cool tones, unknown is a
 *    neutral at least 15 from every tone;
 *  - the accent is at least 10 CIEDE2000 from every tone in every simulation.
 * Fill-on-hover numbers are printed (console.table) and recorded in the plan summary: both candidate
 * palettes measure about 2.9:1 for two tones on the light hover ground, which the outline carries.
 */
import { converter, differenceCiede2000, filterDeficiencyDeuter, filterDeficiencyProt, filterDeficiencyTrit, parse, wcagContrast } from 'culori';
import type { Color } from 'culori';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, parseDirectionTokens, type Direction } from './support/tokens-css';

const TOKENS = parseDirectionTokens();
const TONES = ['degraded', 'restored-early', 'restored-mid', 'healthy', 'unknown'] as const;
type Tone = (typeof TONES)[number];

const SIMULATIONS: Array<[string, (c: Color) => Color]> = [
  ['normal', (c) => c],
  ['protanopia', filterDeficiencyProt(1)],
  ['deuteranopia', filterDeficiencyDeuter(1)],
  ['tritanopia', filterDeficiencyTrit(1)],
];

const ciede = differenceCiede2000();
const lab = converter('lab65');
const lch = converter('lch65');

function token(direction: Direction, name: string): string {
  const value = TOKENS[direction][`--dir-${name}`];
  if (!value) throw new Error(`${direction}: --dir-${name} is not defined in tokens.css`);
  return value;
}

function colour(direction: Direction, name: string): Color {
  const parsed = parse(token(direction, name));
  if (!parsed) throw new Error(`${direction}: --dir-${name} (${token(direction, name)}) is not a colour`);
  return parsed;
}

const tone = (direction: Direction, t: Tone) => colour(direction, `hab-${t}`);
const ratio = (a: Color, b: Color) => wcagContrast(a, b);
const fmt = (n: number) => n.toFixed(2);

describe.each(DIRECTIONS)('status palette: %s', (direction) => {
  it('defines the five status tones and the mark outline tokens as hex', () => {
    for (const t of TONES) expect(token(direction, `hab-${t}`)).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(token(direction, 'mark-outline')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(token(direction, 'mark-fill-unknown')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('every mark fill reaches 3:1 on ground and panel', () => {
    const failures: string[] = [];
    for (const g of ['ground', 'panel']) {
      for (const t of TONES) {
        const r = ratio(tone(direction, t), colour(direction, g));
        if (r < 3) failures.push(`hab-${t} on ${g}: ${fmt(r)}:1 (need 3.00)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('prints the fill contrast on every ground, hover included', () => {
    const rows = TONES.map((t) => ({
      direction,
      tone: t,
      hex: token(direction, `hab-${t}`),
      ground: fmt(ratio(tone(direction, t), colour(direction, 'ground'))),
      panel: fmt(ratio(tone(direction, t), colour(direction, 'panel'))),
      'panel-hover': fmt(ratio(tone(direction, t), colour(direction, 'panel-hover'))),
      selected: fmt(ratio(tone(direction, t), colour(direction, 'selected'))),
    }));
    console.table(rows);
    expect(rows).toHaveLength(5);
  });

  it('every mark boundary reaches 3:1 on ground, panel, panel-hover and selected', () => {
    const outline = colour(direction, 'mark-outline');
    const failures: string[] = [];
    for (const g of ['ground', 'panel', 'panel-hover', 'selected']) {
      const ground = colour(direction, g);
      const outlineRatio = ratio(outline, ground);
      if (outlineRatio >= 3) continue;
      // The outline is not the contrast carrier on this ground: every fill must be.
      for (const t of TONES) {
        const fillRatio = ratio(tone(direction, t), ground);
        if (fillRatio < 3) {
          failures.push(`${g}: mark-outline ${fmt(outlineRatio)}:1 and hab-${t} fill ${fmt(fillRatio)}:1 (need 3.00 from one of them)`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('the hollow unknown ring has a fill that matches the ground it sits on', () => {
    // The ring is mark-fill-unknown inside a 2.5 px status-colour stroke; the fill must be as light
    // or dark as the panel family so the ring reads as hollow, and the stroke carries the contrast.
    const fillUnknown = colour(direction, 'mark-fill-unknown');
    const ground = colour(direction, 'ground');
    expect(ratio(fillUnknown, ground)).toBeLessThan(1.3);
  });

  it.each(SIMULATIONS)('minimum pairwise CIEDE2000 over the five tones is at least 15 under %s', (_name, sim) => {
    const failures: string[] = [];
    for (let i = 0; i < TONES.length; i++) {
      for (let j = i + 1; j < TONES.length; j++) {
        const d = ciede(sim(tone(direction, TONES[i])), sim(tone(direction, TONES[j])));
        if (d < 15) failures.push(`${TONES[i]} / ${TONES[j]}: ${fmt(d)} (need 15.00)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(SIMULATIONS)('unknown is at least 15 from every other tone under %s', (_name, sim) => {
    const failures: string[] = [];
    for (const t of TONES.filter((x) => x !== 'unknown')) {
      const d = ciede(sim(tone(direction, 'unknown')), sim(tone(direction, t)));
      if (d < 15) failures.push(`unknown / ${t}: ${fmt(d)} (need 15.00)`);
    }
    expect(failures).toEqual([]);
  });

  it('unknown is a neutral (lch65 chroma below 10)', () => {
    const chroma = lch(tone(direction, 'unknown')).c ?? 0;
    expect(chroma, `unknown chroma ${fmt(chroma)}`).toBeLessThan(10);
  });

  it('adjacent ordinal tones differ by at least 9 L*', () => {
    const ordinal: Tone[] = ['degraded', 'restored-early', 'restored-mid', 'healthy'];
    const failures: string[] = [];
    for (let i = 0; i < ordinal.length - 1; i++) {
      const dl = Math.abs(lab(tone(direction, ordinal[i])).l - lab(tone(direction, ordinal[i + 1])).l);
      if (dl < 9) failures.push(`${ordinal[i]} / ${ordinal[i + 1]}: ${fmt(dl)} L* (need 9.00)`);
    }
    expect(failures).toEqual([]);
  });

  it('warm tones precede cool tones: degraded and restored-early hue 20 to 110, restored-mid and healthy hue 180 to 300', () => {
    const hue = (t: Tone) => lch(tone(direction, t)).h ?? Number.NaN;
    for (const t of ['degraded', 'restored-early'] as const) {
      expect(hue(t), `${t} hue ${fmt(hue(t))}`).toBeGreaterThanOrEqual(20);
      expect(hue(t), `${t} hue ${fmt(hue(t))}`).toBeLessThanOrEqual(110);
    }
    for (const t of ['restored-mid', 'healthy'] as const) {
      expect(hue(t), `${t} hue ${fmt(hue(t))}`).toBeGreaterThanOrEqual(180);
      expect(hue(t), `${t} hue ${fmt(hue(t))}`).toBeLessThanOrEqual(300);
    }
  });

  it.each(SIMULATIONS)('the accent is at least 10 CIEDE2000 from every status tone under %s', (_name, sim) => {
    const accent = sim(colour(direction, 'accent'));
    const failures: string[] = [];
    for (const t of TONES) {
      const d = ciede(accent, sim(tone(direction, t)));
      if (d < 10) failures.push(`accent ${token(direction, 'accent')} / hab-${t} ${token(direction, `hab-${t}`)}: ${fmt(d)} (need 10.00)`);
    }
    expect(failures).toEqual([]);
  });

  it('the accent is never a status colour', () => {
    const accent = token(direction, 'accent').toLowerCase();
    for (const t of TONES) expect(token(direction, `hab-${t}`).toLowerCase()).not.toBe(accent);
  });
});
