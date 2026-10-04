// @vitest-environment node
import type { AtRule, Container, Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { JS_TOKEN_KEYS } from '@/features/ui/tokens';
import {
  DIRECTIONS,
  HEX6,
  TAILWIND_THEME_CSS_PATH,
  parseDirectionTokens,
  parseLegacyNames,
  parseThemeInline,
  parseThemeKeys,
  parseThemeKeysOf,
  parseTokensCss,
  type Direction,
} from './support/tokens-css';

/**
 * The token gate (04-02): everything is asserted over the parsed tokens.css, the one place values
 * live. There is no TypeScript copy of a token value except the expected status palettes below,
 * which are the UI-SPEC contract the CSS must equal.
 */

const COLOR_KEYS = [
  'ground', 'panel', 'panel-hover', 'selected', 'track', 'ink', 'muted', 'rule', 'rule-strong', 'rule-heavy',
  'accent', 'focus', 'control', 'on-control', 'control-hover', 'control-pressed', 'well', 'well-raised',
  'well-ink', 'well-muted', 'well-rule', 'focus-on-well', 'band', 'on-band', 'on-band-muted',
  'band-control-hover', 'band-control-pressed', 'accent-block', 'on-accent-block', 'focus-on-accent',
  'block-alt', 'on-block-alt', 'inverse', 'on-inverse', 'playhead', 'scrim', 'mark-outline',
  'mark-fill-unknown', 'hab-degraded', 'hab-restored-early', 'hab-restored-mid', 'hab-healthy', 'hab-unknown',
] as const;

const FONT_KEYS = ['display', 'body', 'data', 'numeral'] as const;

const SHAPE_KEYS = [
  '--display-style', '--display-case', '--display-tracking', '--display-leading', '--dir-radius-surface',
  '--dir-radius-control', '--rule-w', '--rule-w-heavy', '--focus-w', '--mark-outline-w', '--space-block',
  '--max-blocks', '--dir-gutter-wide', '--dir-display-xl', '--dir-display-l', '--dir-display-m', '--dir-numeral',
] as const;

const EXPECTED_KEYS = [
  ...COLOR_KEYS.map((key) => `--dir-${key}`),
  ...FONT_KEYS.map((key) => `--dir-font-${key}`),
  ...SHAPE_KEYS,
].sort();

// The status palette contract (04-UI-SPEC "Status palette"): light-ground palette for atlas and
// poster, dark-ground palette for nocturne.
const LIGHT_PALETTE = {
  '--dir-hab-degraded': '#914615',
  '--dir-hab-restored-early': '#b47f24',
  '--dir-hab-restored-mid': '#1d77ad',
  '--dir-hab-healthy': '#124068',
  '--dir-hab-unknown': '#85888d',
};
const DARK_PALETTE = {
  '--dir-hab-degraded': '#d77540',
  '--dir-hab-restored-early': '#fac06d',
  '--dir-hab-restored-mid': '#2c95ca',
  '--dir-hab-healthy': '#95daf7',
  '--dir-hab-unknown': '#a1a5ac',
};
const EXPECTED_PALETTE: Record<Direction, Record<string, string>> = {
  atlas: LIGHT_PALETTE,
  nocturne: DARK_PALETTE,
  poster: LIGHT_PALETTE,
};

const DURATION_KEYS = ['--duration-fast', '--duration-base', '--duration-morph', '--duration-view'];

const root = parseTokensCss();
const directions = parseDirectionTokens(root);

function ancestors(node: Container | undefined | null): Container[] {
  const chain: Container[] = [];
  let current = node ?? undefined;
  while (current) {
    chain.push(current as Container);
    current = (current as Container).parent as Container | undefined;
  }
  return chain;
}

function declarations(rule: Rule): Record<string, string> {
  const out: Record<string, string> = {};
  rule.each((node) => {
    if (node.type === 'decl') out[node.prop] = node.value.trim();
  });
  return out;
}

describe('direction blocks', () => {
  it('has one block per direction and every direction has the full key set', () => {
    for (const direction of DIRECTIONS) {
      expect(Object.keys(directions[direction]).sort(), direction).toEqual(EXPECTED_KEYS);
    }
  });

  it('the three key sets are identical', () => {
    const [atlas, nocturne, poster] = DIRECTIONS.map((direction) => Object.keys(directions[direction]).sort());
    expect(nocturne).toEqual(atlas);
    expect(poster).toEqual(atlas);
  });

  it('every colour except scrim is a six-digit hex; scrim is rgba', () => {
    for (const direction of DIRECTIONS) {
      for (const key of COLOR_KEYS) {
        const value = directions[direction][`--dir-${key}`];
        if (key === 'scrim') expect(value, `${direction} ${key}`).toMatch(/^rgba\(\d+, ?\d+, ?\d+, ?0?\.\d+\)$/);
        else expect(value, `${direction} ${key}`).toMatch(HEX6);
      }
    }
  });

  it('every token JavaScript reads exists in every direction and is a six-digit hex', () => {
    for (const direction of DIRECTIONS) {
      for (const key of JS_TOKEN_KEYS) {
        const value = directions[direction][`--dir-${key}`];
        expect(value, `${direction} ${key}`).toBeDefined();
        expect(value, `${direction} ${key}`).toMatch(HEX6);
      }
    }
  });

  it('hab-* values equal the contract per direction', () => {
    for (const direction of DIRECTIONS) {
      for (const [name, expected] of Object.entries(EXPECTED_PALETTE[direction])) {
        expect(directions[direction][name].toLowerCase(), `${direction} ${name}`).toBe(expected);
      }
    }
  });

  it('atlas, nocturne and poster differ where the UI-SPEC says they differ', () => {
    expect(directions.atlas['--dir-ground']).toBe('#ffffff');
    expect(directions.nocturne['--dir-ground']).toBe('#0b0d12');
    expect(directions.poster['--dir-accent-block']).toBe('#c6f432');
    expect(directions.poster['--dir-block-alt']).toBe('#ff6fb1');
    expect(directions.atlas['--display-style']).toBe('italic');
    expect(directions.poster['--display-case']).toBe('uppercase');
    expect(directions.atlas['--dir-radius-control']).toBe('0');
    expect(directions.poster['--dir-radius-control']).toBe('9999px');
    expect(directions.atlas['--rule-w-heavy']).toBe('3px');
    expect(directions.nocturne['--rule-w-heavy']).toBe('1px');
    expect(directions.poster['--rule-w-heavy']).toBe('6px');
    expect(directions.atlas['--max-blocks']).toBe('1');
    expect(directions.nocturne['--max-blocks']).toBe('1');
    expect(directions.poster['--max-blocks']).toBe('3');
    expect(directions.atlas['--dir-gutter-wide']).toBe('48px');
    expect(directions.nocturne['--dir-gutter-wide']).toBe('32px');
    expect(directions.poster['--dir-gutter-wide']).toBe('48px');
  });

  it('fonts reference the next/font variables the instrument layout will set', () => {
    expect(directions.atlas['--dir-font-display']).toContain('--font-newsreader-italic');
    expect(directions.atlas['--dir-font-numeral']).toContain('--font-newsreader-roman');
    expect(directions.nocturne['--dir-font-display']).toContain('--font-spline-mono');
    expect(directions.poster['--dir-font-display']).toContain('--font-archivo-black');
    for (const direction of DIRECTIONS) {
      expect(directions[direction]['--dir-font-body']).toContain('--font-hanken');
      expect(directions[direction]['--dir-font-data']).toContain('--font-spline-mono');
    }
  });

  it('the page gutter steps 16, 24, 32 and then takes the direction value from 1280', () => {
    const gutters = new Map<string, string>();
    root.walkAtRules('media', (media) => {
      media.walkDecls('--gutter', (decl) => gutters.set(media.params, decl.value.trim()));
    });
    expect(gutters.get('(min-width: 640px)')).toBe('24px');
    expect(gutters.get('(min-width: 1024px)')).toBe('32px');
    expect(gutters.get('(min-width: 1280px)')).toBe('var(--dir-gutter-wide)');
    let base: string | undefined;
    root.each((node) => {
      if (node.type === 'rule' && node.selector.includes('html:has') && !base) {
        const gutter = declarations(node)['--gutter'];
        if (gutter) base = gutter;
      }
    });
    expect(base).toBe('16px');
  });
});

describe('@theme inline aliases', () => {
  const inline = parseThemeInline(root);

  it('every theme block in tokens.css is inline, so nothing is emitted to :root', () => {
    root.walkAtRules('theme', (rule: AtRule) => {
      expect(rule.params, 'a plain @theme would resolve --dir-* once at :root').toMatch(/\binline\b/);
    });
  });

  it('every colour key is aliased as --color-<name>: var(--dir-<name>)', () => {
    for (const key of COLOR_KEYS) {
      expect(inline[`--color-${key}`], key).toBe(`var(--dir-${key})`);
    }
  });

  it('fonts and radii are aliased to their --dir-* variables', () => {
    for (const key of FONT_KEYS) expect(inline[`--font-${key}`], key).toBe(`var(--dir-font-${key})`);
    expect(inline['--radius-surface']).toBe('var(--dir-radius-surface)');
    expect(inline['--radius-control']).toBe('var(--dir-radius-control)');
  });

  it('fluid display sizes alias the per-direction clamp values with the direction leading', () => {
    for (const tier of ['xl', 'l', 'm']) {
      expect(inline[`--text-display-${tier}`]).toBe(`var(--dir-display-${tier})`);
      expect(inline[`--text-display-${tier}--line-height`]).toBe('var(--display-leading)');
    }
    expect(inline['--text-numeral']).toBe('var(--dir-numeral)');
    expect(inline['--text-numeral--line-height']).toBe('0.8');
    expect(inline['--text-numeral--letter-spacing']).toBe('-0.04em');
  });

  it('fixed type roles are rem sizes with the UI-SPEC line heights', () => {
    const expected: Record<string, [string, string]> = {
      eyebrow: ['0.75rem', '1.5'],
      small: ['0.875rem', '1.5'],
      body: ['1rem', '1.5'],
      lead: ['1.5rem', '1.2'],
      title: ['1.75rem', '1.1'],
      h2: ['2.5rem', '1.1'],
      id: ['2.75rem', '1.1'],
    };
    for (const [name, [size, leading]] of Object.entries(expected)) {
      expect(inline[`--text-${name}`], name).toBe(size);
      expect(inline[`--text-${name}--line-height`], name).toBe(leading);
    }
  });

  it('every var(--dir-*) an alias points at is defined in all three directions', () => {
    for (const [name, value] of Object.entries(inline)) {
      const match = /^var\((--dir-[a-z0-9-]+)\)$/.exec(value);
      if (!match) continue;
      for (const direction of DIRECTIONS) {
        expect(directions[direction][match[1]], `${name} -> ${match[1]} in ${direction}`).toBeDefined();
      }
    }
  });
});

describe('no collision with a legacy name', () => {
  const legacy = parseLegacyNames();
  const themeKeys = Object.keys(parseThemeKeys(root));
  const tailwindDefaults = new Set(Object.keys(parseThemeKeysOf(TAILWIND_THEME_CSS_PATH)));

  it('found the legacy names to compare against', () => {
    expect(legacy.themeKeys.has('--color-abyss')).toBe(true);
    expect(legacy.themeKeys.has('--color-status-healthy')).toBe(true);
    expect(legacy.rootVars.has('--glass-bg')).toBe(true);
    expect(legacy.rootVars.has('--text-primary')).toBe(true);
    expect(tailwindDefaults.has('--font-sans')).toBe(true);
  });

  it('no new @theme key equals a legacy @theme key, a legacy :root variable or a Tailwind default key', () => {
    expect(themeKeys.length).toBeGreaterThan(50);
    for (const key of themeKeys) {
      expect(legacy.themeKeys.has(key), `${key} collides with a legacy @theme key`).toBe(false);
      expect(legacy.rootVars.has(key), `${key} collides with a legacy :root variable`).toBe(false);
      expect(tailwindDefaults.has(key), `${key} would override a Tailwind default`).toBe(false);
    }
  });

  it('no new --text-* key equals --text-primary, --text-secondary, --text-muted or --text-dim', () => {
    const reserved = ['--text-primary', '--text-secondary', '--text-muted', '--text-dim'];
    for (const key of themeKeys.filter((name) => name.startsWith('--text-'))) {
      expect(reserved, key).not.toContain(key);
    }
  });

  it('no custom property tokens.css declares equals a legacy variable or theme key', () => {
    const declared = new Set<string>();
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) declared.add(decl.prop);
    });
    for (const name of declared) {
      expect(legacy.rootVars.has(name), `${name} collides with a legacy :root variable`).toBe(false);
      expect(legacy.themeKeys.has(name), `${name} collides with a legacy @theme key`).toBe(false);
    }
  });
});

describe('scoping', () => {
  it('every style rule is scoped to an instrument surface (no legacy page can match one)', () => {
    const offenders: string[] = [];
    root.walkRules((rule) => {
      if (ancestors(rule.parent as Container).some((node) => node.type === 'atrule' && (node as AtRule).name === 'utility')) return;
      for (const part of rule.selectors) {
        if (!part.includes("[data-surface='instrument']")) offenders.push(part);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('declares the three state variants and the utilities the components rely on', () => {
    const variants = new Map<string, string>();
    root.walkAtRules('custom-variant', (rule) => variants.set(rule.params.split(/\s+/, 1)[0], rule.params));
    expect(variants.get('hover-state')).toContain('data-hovered');
    expect(variants.get('hover-state')).toContain('data-force-hover');
    expect(variants.get('focus-state')).toContain('data-focus-visible');
    expect(variants.get('focus-state')).toContain('data-force-focus');
    expect(variants.get('pressed-state')).toContain('data-pressed');
    expect(variants.get('pressed-state')).toContain('data-force-pressed');

    const utilities = new Set<string>();
    root.walkAtRules('utility', (rule) => utilities.add(rule.params));
    for (const name of [
      'type-display', 'type-eyebrow', 'focus-ring', 'focus-ring-inset', 'focus-ring-well', 'focus-ring-accent',
      'rule-top-heavy', 'tabular', 'hit-area',
    ]) {
      expect(utilities.has(name), name).toBe(true);
    }
  });

  it('the surface resets cover the legacy transition, focus ring, scrollbar and smooth scroll', () => {
    const css = root.toString();
    expect(css).toMatch(/\[data-surface='instrument'\] \*,[\s\S]*?transition: none/);
    expect(css).toMatch(/\[data-surface='instrument'\] :focus-visible/);
    expect(css).toContain("html:has([data-surface='instrument']) ::-webkit-scrollbar-track");
    expect(css).toContain("html:has([data-surface='instrument']) ::-webkit-scrollbar-thumb");
    expect(css).toMatch(/html:has\(\[data-surface='instrument'\]\) \{[^}]*scroll-behavior: auto/);
    expect(css).toMatch(/html:has\(\[data-surface='instrument'\]\) body \{[^}]*background-color: var\(--dir-ground\)/);
  });
});

describe('motion', () => {
  const durationRules: { rule: Rule; reduced: boolean; forced: boolean; values: Record<string, string> }[] = [];
  root.walkRules((rule) => {
    const values = declarations(rule);
    if (!DURATION_KEYS.some((key) => key in values)) return;
    const inMedia = ancestors(rule.parent as Container).some(
      (node) => node.type === 'atrule' && (node as AtRule).name === 'media' && (node as AtRule).params.includes('prefers-reduced-motion: reduce'),
    );
    durationRules.push({ rule, reduced: inMedia, forced: rule.selector.includes("[data-reduced-motion='true']"), values });
  });

  it('sets the four durations and the easing on the surface root by default', () => {
    const base = durationRules.find((entry) => !entry.reduced && !entry.forced);
    expect(base?.values).toMatchObject({
      '--duration-fast': '120ms',
      '--duration-base': '200ms',
      '--duration-morph': '400ms',
      '--duration-view': '200ms',
    });
    let ease: string | undefined;
    root.walkDecls('--ease', (decl) => {
      ease = decl.value.trim();
    });
    expect(ease).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('all four durations compute to 0ms under prefers-reduced-motion', () => {
    const reduced = durationRules.filter((entry) => entry.reduced);
    expect(reduced.length).toBeGreaterThan(0);
    for (const entry of reduced) for (const key of DURATION_KEYS) expect(entry.values[key], key).toBe('0ms');
  });

  it("all four durations compute to 0ms under data-reduced-motion='true'", () => {
    const forced = durationRules.filter((entry) => entry.forced);
    expect(forced.length).toBeGreaterThan(0);
    for (const entry of forced) {
      expect(entry.rule.selector).toContain("[data-surface='instrument'][data-reduced-motion='true']");
      for (const key of DURATION_KEYS) expect(entry.values[key], key).toBe('0ms');
    }
  });

  it('no direction block declares a duration (motion does not vary by direction)', () => {
    for (const direction of DIRECTIONS) {
      for (const key of DURATION_KEYS) expect(directions[direction][key], `${direction} ${key}`).toBeUndefined();
    }
  });

  it('view transition animations are cut to 0s under both reduced-motion forms', () => {
    const css = root.toString();
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?::view-transition-group\(\*\)[\s\S]*?animation-duration: 0s !important/);
    expect(css).toMatch(/data-reduced-motion='true'\]\)::view-transition-new\(\*\)[\s\S]*?animation-delay: 0s !important/);
  });
});
