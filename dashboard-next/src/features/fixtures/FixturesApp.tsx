'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEV_FIXTURES_MARKER } from './marker';
import { parseFixtureQuery } from './query';

/**
 * The instrument surface root for the dev-only design-system fixtures (DS-08).
 *
 * Direction, reduced motion and hex token overrides come from the URL through the allowlist in
 * query.ts. The root carries data-surface="instrument", which is the only selector tokens.css
 * reacts to, so nothing outside this subtree (and the html element, through :has) changes.
 *
 * Plan 04-07 adds the chrome, the section navigation and the sections inside this root.
 */
const SURFACE_CLASS = 'min-h-screen bg-ground text-ink font-body';

function Heading() {
  return (
    <main className="p-6">
      <h1 className="font-numeral text-title">ReefRadar fixtures</h1>
      <p className="text-small text-muted">
        Dev-only review surface for the design system. Not linked from the product.
      </p>
    </main>
  );
}

function FixturesSurface() {
  const searchParams = useSearchParams();
  const { direction, reduced, tokenOverrides } = parseFixtureQuery(searchParams);
  const rootRef = useRef<HTMLDivElement>(null);

  // A stable key so the effect re-runs only when the override set actually changes.
  const overrideKey = JSON.stringify(tokenOverrides);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const applied = JSON.parse(overrideKey) as Array<[string, string]>;
    for (const [name, value] of applied) root.style.setProperty(name, value);
    return () => {
      for (const [name] of applied) root.style.removeProperty(name);
    };
  }, [overrideKey]);

  return (
    <div
      ref={rootRef}
      data-surface="instrument"
      data-direction={direction}
      data-reduced-motion={reduced ? 'true' : undefined}
      data-fixtures-marker={DEV_FIXTURES_MARKER}
      className={SURFACE_CLASS}
    >
      <Heading />
    </div>
  );
}

/**
 * The Suspense fallback is the same surface with the atlas defaults, so the prerendered HTML
 * already carries data-surface and the page paints the atlas ground from the first frame instead
 * of flashing the legacy dark body colour until the query has been read on the client.
 */
function FixturesSurfaceFallback() {
  return (
    <div
      data-surface="instrument"
      data-direction="atlas"
      data-fixtures-marker={DEV_FIXTURES_MARKER}
      className={SURFACE_CLASS}
    >
      <Heading />
    </div>
  );
}

export function FixturesApp() {
  return (
    <Suspense fallback={<FixturesSurfaceFallback />}>
      <FixturesSurface />
    </Suspense>
  );
}
