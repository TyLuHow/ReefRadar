'use client';

import { useCallback, useSyncExternalStore, type RefObject } from 'react';

/**
 * The one JS-side reduced-motion switch (DS-06, UI-SPEC "Motion"). CSS already zeroes every
 * --duration-* token under `prefers-reduced-motion: reduce` and under `[data-reduced-motion='true']`
 * on the surface root (tokens.css); this hook mirrors the same two sources for code that cannot
 * read a duration token: canvas and requestAnimationFrame loops, the playhead's stepped mode, the
 * crossfader's smoothing. When it is true, no frame loop may start.
 *
 * The attribute is read from the nearest `[data-surface="instrument"]` ancestor of `ref`, else from
 * the first such element in the document (the fixtures toggle sets it on that root).
 */

const QUERY = '(prefers-reduced-motion: reduce)';
const SURFACE_SELECTOR = '[data-surface="instrument"]';
const ATTRIBUTE = 'data-reduced-motion';

function findSurface(ref?: RefObject<Element | null>): Element | null {
  const own = ref?.current?.closest(SURFACE_SELECTOR) ?? null;
  return own ?? document.querySelector(SURFACE_SELECTOR);
}

function osPrefersReduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** True when the OS asks for reduced motion or the surface root carries data-reduced-motion="true". */
export function useReducedMotion(ref?: RefObject<Element | null>): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const query = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
      query?.addEventListener('change', onChange);
      const surface = findSurface(ref);
      const observer = surface ? new MutationObserver(onChange) : null;
      if (surface) observer?.observe(surface, { attributes: true, attributeFilter: [ATTRIBUTE] });
      return () => {
        query?.removeEventListener('change', onChange);
        observer?.disconnect();
      };
    },
    [ref],
  );

  const getSnapshot = useCallback(() => osPrefersReduced() || findSurface(ref)?.getAttribute(ATTRIBUTE) === 'true', [ref]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
