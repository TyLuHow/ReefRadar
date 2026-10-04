'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import type { Direction } from '../query';

/**
 * Section anatomy for /dev/fixtures (UI-SPEC "Section anatomy"): eyebrow "{group} · {kind}", an h2,
 * one contract paragraph, a "Data:" line naming every source the fixtures read (traceability) and
 * then a grid of state cells. Wide primitives span the grid with StateCell span="full".
 */

export type FixtureGroup = 'Foundation' | 'DS-04' | 'DS-05' | 'Composition' | 'Probe';

export interface FixtureSectionMeta {
  /** The URL segment and the section id; must also be listed in slugs.ts. */
  slug: string;
  group: FixtureGroup;
  /** The kind of thing reviewed, for example "Tokens" or "Primitive". */
  kind: string;
  title: string;
  /** One or two sentences stating the contract this section demonstrates. */
  contract: string;
  /** The files and ids of every fixture used. Real data only. */
  data: string;
}

/** What the chrome has decided, for sections that need to say it (the current direction name). */
export interface FixtureChromeState {
  direction: Direction;
  reduced: boolean;
}

const FixtureChromeContext = createContext<FixtureChromeState>({ direction: 'atlas', reduced: false });

export const FixtureChromeProvider = FixtureChromeContext.Provider;

/** The direction and reduced-motion state chosen in the page chrome (from the URL). */
export function useFixtureChrome(): FixtureChromeState {
  return useContext(FixtureChromeContext);
}

export function FixtureSection({ slug, group, kind, title, contract, data, children }: FixtureSectionMeta & { children?: ReactNode }) {
  const headingId = useId();
  return (
    <section id={slug} aria-labelledby={headingId} className="scroll-mt-6">
      <p className="type-eyebrow text-muted">{`${group} · ${kind}`}</p>
      <h2 id={headingId} className="font-numeral text-lead mt-1">
        {title}
      </h2>
      <p className="text-small text-muted mt-2 max-w-[72ch]">{contract}</p>
      <p className="font-data text-eyebrow text-muted mt-2 [overflow-wrap:anywhere]">{`Data: ${data}`}</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">{children}</div>
    </section>
  );
}
