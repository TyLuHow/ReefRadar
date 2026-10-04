'use client';

import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * AccentBlock (DS-05, UI-SPEC "AccentBlock"): one solid surface, `accent-block` fill and
 * `on-accent-block` text, padding 32, no radius, no border. It holds a 40 px lead (the direction's
 * display face), one 16 px sentence and one action (callers pass an inverse Button or LinkButton
 * with tone `accent`).
 *
 * At most one per screen; the Poster direction allows three. The allowance is the direction's
 * `--max-blocks` token, so no component names a direction. A development-only check (and in a
 * production build that sets NEXT_PUBLIC_DEV_FIXTURES) counts the `[data-accent-block]` elements in
 * the nearest `[data-screen]` (else the nearest instrument surface root) and logs an error when
 * there are more than the token allows. It logs once per surface for a given count, and does
 * nothing when there is no surface or no integer token to compare against.
 */

export interface AccentBlockProps {
  /** The lead statement. */
  lead: ReactNode;
  /** One sentence under it. */
  sentence: ReactNode;
  /** The single action. */
  action: ReactNode;
  className?: string;
}

/** The largest count already reported for a surface, so two blocks in one tree log one error. */
const reported = new WeakMap<Element, number>();

function checkEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEV_FIXTURES === '1';
}

export function AccentBlock({ lead, sentence, action, className }: AccentBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!checkEnabled()) return;
    const node = ref.current;
    if (!node) return;
    const scope = node.closest('[data-screen]') ?? node.closest('[data-surface="instrument"]');
    if (!scope) return;
    const max = Number.parseInt(getComputedStyle(scope).getPropertyValue('--max-blocks'), 10);
    if (!Number.isInteger(max)) return;
    const count = scope.querySelectorAll('[data-accent-block]').length;
    if (count > max && count > (reported.get(scope) ?? 0)) {
      reported.set(scope, count);
      console.error(`AccentBlock: ${count} accent blocks on one screen; this direction allows ${max}.`);
    }
  });

  return (
    <div
      ref={ref}
      data-accent-block=""
      className={clsx('bg-accent-block text-on-accent-block p-8 text-start', className)}
    >
      <p className="type-display text-h2">{lead}</p>
      <p className="text-body mt-4">{sentence}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}
