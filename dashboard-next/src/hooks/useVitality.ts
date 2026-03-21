'use client';

import { useEffect, useRef } from 'react';
import { useVitalityStore } from '@/stores/vitality-store';
import { computeReefColors } from '@/lib/color-engine';
import type { ReefColors } from '@/lib/color-engine';

/**
 * Writes all 8 --reef-* CSS custom properties to :root in a single batch.
 */
function writeCSSVariables(colors: ReefColors): void {
  const s = document.documentElement.style;
  s.setProperty('--reef-primary', colors.primary);
  s.setProperty('--reef-accent', colors.accent);
  s.setProperty('--reef-secondary', colors.secondary);
  s.setProperty('--reef-highlight', colors.highlight);
  s.setProperty('--reef-bg', colors.bg);
  s.setProperty('--reef-surface', colors.surface);
  s.setProperty('--reef-glow', colors.glow);
  s.setProperty('--reef-text', colors.text);
}

/**
 * Starts a rAF animation loop that continuously lerps toward the vitality
 * target from the zustand store, computes HSL colors, and writes CSS variables.
 *
 * - Reads zustand target via getState() (no React subscription, no re-renders)
 * - Animation state lives entirely in refs
 * - CSS writes throttled to 30fps (~33ms intervals)
 * - Ease-out exponential approach: ~300ms to 95% convergence at 60fps
 *
 * Call once in a top-level client component (e.g., Providers).
 * Returns nothing -- all output via CSS custom properties.
 */
export function useVitality(): void {
  const currentRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    // Guard against double-start (React StrictMode)
    if (runningRef.current) return;
    runningRef.current = true;

    // Accessibility: skip lerp animation for reduced-motion users
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const tick = (timestamp: number) => {
      const target = useVitalityStore.getState().target;

      if (prefersReducedMotion) {
        // Instant jump: no lerp animation, but still write CSS variables
        currentRef.current = target;
      } else {
        // Ease-out exponential approach (~300ms to 95% convergence at 60fps)
        currentRef.current += (target - currentRef.current) * 0.08;

        // Snap when close enough to avoid infinite approach
        if (Math.abs(target - currentRef.current) < 0.001) {
          currentRef.current = target;
        }
      }

      // Still write CSS variables at 30fps -- color changes are NOT motion
      if (timestamp - lastWriteRef.current > 33) {
        const colors = computeReefColors(currentRef.current);
        writeCSSVariables(colors);
        lastWriteRef.current = timestamp;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      runningRef.current = false;
    };
  }, []);
}

export { useVitalityStore } from '@/stores/vitality-store';
