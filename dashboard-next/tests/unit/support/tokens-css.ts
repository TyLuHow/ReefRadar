import * as fs from 'node:fs';
import * as path from 'node:path';
import postcss, { type AtRule, type Root, type Rule } from 'postcss';

/**
 * Parsers over the real CSS files for the token gates (04-02). tokens.css is the only place token
 * values live, so tests read it directly and never keep a TypeScript copy of a value. Plans 04-04
 * and later reuse these helpers for the contrast and status-palette gates.
 */

// tests/unit/support -> unit -> tests -> dashboard-next
const DASHBOARD_ROOT = path.resolve(__dirname, '..', '..', '..');
export const TOKENS_CSS_PATH = path.join(DASHBOARD_ROOT, 'src', 'styles', 'tokens.css');
export const LEGACY_CSS_PATH = path.join(DASHBOARD_ROOT, 'src', 'styles', 'legacy.css');
export const TAILWIND_THEME_CSS_PATH = path.join(DASHBOARD_ROOT, 'node_modules', 'tailwindcss', 'theme.css');

export const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type DirectionTokens = Record<Direction, Record<string, string>>;

export function parseCssFile(file: string): Root {
  return postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
}

export function parseTokensCss(): Root {
  return parseCssFile(TOKENS_CSS_PATH);
}

function customProperties(rule: Rule | AtRule): Record<string, string> {
  const out: Record<string, string> = {};
  rule.each((node) => {
    if (node.type === 'decl' && node.prop.startsWith('--')) out[node.prop] = node.value.trim();
  });
  return out;
}

/**
 * The custom properties of each direction block: top-level rules (no at-rule parent) whose selector
 * names data-direction='<direction>'. Keys keep the leading `--`, for example `--dir-ground`.
 */
export function parseDirectionTokens(root: Root = parseTokensCss()): DirectionTokens {
  const result: DirectionTokens = { atlas: {}, nocturne: {}, poster: {} };
  root.each((node) => {
    if (node.type !== 'rule') return;
    for (const direction of DIRECTIONS) {
      if (node.selector.includes(`data-direction='${direction}'`)) {
        Object.assign(result[direction], customProperties(node));
      }
    }
  });
  return result;
}

function themeAtRules(root: Root, inline: boolean | null): AtRule[] {
  const found: AtRule[] = [];
  root.walkAtRules('theme', (rule) => {
    const isInline = /\binline\b/.test(rule.params);
    if (inline === null || inline === isInline) found.push(rule);
  });
  return found;
}

/** Declarations of every `@theme inline` block, as `--name` to value. */
export function parseThemeInline(root: Root = parseTokensCss()): Record<string, string> {
  return Object.assign({}, ...themeAtRules(root, true).map(customProperties));
}

/** Declarations of every `@theme` block (inline or not), as `--name` to value. */
export function parseThemeKeys(root: Root = parseTokensCss()): Record<string, string> {
  return Object.assign({}, ...themeAtRules(root, null).map(customProperties));
}

/** Declarations of the `@theme` blocks of an arbitrary CSS file (Tailwind's own theme.css). */
export function parseThemeKeysOf(file: string): Record<string, string> {
  return parseThemeKeys(parseCssFile(file));
}

/** Legacy names from legacy.css: the keys of its `@theme` blocks and the variables its `:root` rules declare. */
export function parseLegacyNames(): { themeKeys: Set<string>; rootVars: Set<string> } {
  const root = parseCssFile(LEGACY_CSS_PATH);
  const themeKeys = new Set(Object.keys(parseThemeKeys(root)));
  const rootVars = new Set<string>();
  root.walkRules((rule) => {
    if (rule.selector.trim() === ':root') Object.keys(customProperties(rule)).forEach((name) => rootVars.add(name));
  });
  return { themeKeys, rootVars };
}

/** The six-digit hex shape every JS-visible token must have. */
export const HEX6 = /^#[0-9a-fA-F]{6}$/;
