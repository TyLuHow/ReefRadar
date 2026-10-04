'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Token bridge (DS-01, 04-02). src/styles/tokens.css is the one token source. CSS consumers use the
 * Tailwind utilities; the consumers that cannot use var() (MapLibre paint, canvas fillStyle, chart
 * colour scales) read the resolved custom properties here. TypeScript never restates a value.
 *
 * getComputedStyle(el).getPropertyValue('--x') returns the authored text, so a token that JavaScript
 * reads must be a hex colour. readTokens returns it as a six-digit sRGB hex and throws a TokenError
 * on anything else instead of handing a string a parser will silently misread. The production CSS
 * minifier shortens `#ffffff` to `#fff` (and `#333333` to `#333`, `#000000` to `#000`) in custom
 * properties, so a three-digit hex is expanded here: the authored source says six digits, the
 * computed value in a built app may say three.
 */

/** The tokens JavaScript consumers read, without the `--dir-` prefix. Each is a six-digit hex in tokens.css. */
export const JS_TOKEN_KEYS = [
  'ground',
  'panel',
  'panel-hover',
  'selected',
  'track',
  'ink',
  'muted',
  'rule',
  'rule-strong',
  'accent',
  'focus',
  'well',
  'well-ink',
  'well-muted',
  'well-rule',
  'playhead',
  'mark-outline',
  'mark-fill-unknown',
  'hab-degraded',
  'hab-restored-early',
  'hab-restored-mid',
  'hab-healthy',
  'hab-unknown',
] as const;

export type TokenKey = (typeof JS_TOKEN_KEYS)[number];
export type Tokens = Record<TokenKey, string>;

const SURFACE_SELECTOR = '[data-surface="instrument"]';
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;

/** `#abc` to `#aabbcc`; anything else is returned unchanged. */
function expandShortHex(value: string): string {
  const short = HEX3.exec(value);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value;
}

/** A JS-visible token is missing or is not a six-digit hex. */
export class TokenError extends Error {
  readonly key: string;
  readonly value: string;

  constructor(key: string, value: string) {
    super(
      value === ''
        ? `Token "${key}" (--dir-${key}) is not defined on the element read; is it inside an instrument surface?`
        : `Token "${key}" (--dir-${key}) must be a six-digit hex (a # followed by six hex digits), got "${value}".`,
    );
    this.name = 'TokenError';
    this.key = key;
    this.value = value;
  }
}

type StyleReader = (element: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>;

/**
 * Reads every JS token from `root`'s computed style, trimmed. Throws a TokenError naming the key
 * when a value is missing or is not a six-digit hex. `getStyle` is injectable for tests.
 */
export function readTokens(root: Element, getStyle: StyleReader = (element) => getComputedStyle(element)): Tokens {
  const style = getStyle(root);
  const tokens = {} as Tokens;
  for (const key of JS_TOKEN_KEYS) {
    const value = expandShortHex(style.getPropertyValue(`--dir-${key}`).trim());
    if (!HEX6.test(value)) throw new TokenError(key, value);
    tokens[key] = value;
  }
  return tokens;
}

/** The nearest `[data-surface="instrument"]` element at or above `el`, or null. */
export function findSurfaceRoot(el: Element | null): HTMLElement | null {
  return el ? el.closest<HTMLElement>(SURFACE_SELECTOR) : null;
}

interface TokenState {
  tokens: Tokens | null;
  version: number;
  error: Error | null;
}

const EMPTY: TokenState = { tokens: null, version: 0, error: null };

/**
 * Reads the tokens on mount and again whenever the surface root's `data-direction`, `style` or
 * `data-reduced-motion` attribute changes, so a direction switch or an inline override re-renders
 * consumers. `version` increases on each re-read; use it as an effect dependency to rebuild a canvas
 * or a chart. `tokens` is null while the ref is empty or outside an instrument surface. A token that
 * fails validation is thrown during render so an error boundary shows it.
 */
export function useTokens(ref: RefObject<Element | null>): { tokens: Tokens | null; version: number } {
  const [state, setState] = useState<TokenState>(EMPTY);

  useEffect(() => {
    const surface = findSurfaceRoot(ref.current);
    if (!surface) {
      setState(EMPTY);
      return;
    }

    const read = (bump: boolean) => {
      try {
        const tokens = readTokens(surface);
        setState((previous) => ({ tokens, version: previous.version + (bump ? 1 : 0), error: null }));
      } catch (error) {
        setState((previous) => ({
          tokens: null,
          version: previous.version + (bump ? 1 : 0),
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      }
    };

    read(false);
    const observer = new MutationObserver(() => read(true));
    observer.observe(surface, {
      attributes: true,
      attributeFilter: ['data-direction', 'style', 'data-reduced-motion'],
    });
    return () => observer.disconnect();
  }, [ref]);

  if (state.error) throw state.error;
  return { tokens: state.tokens, version: state.version };
}
