'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RouterProvider } from 'react-aria-components';
import { useModelVersion } from '@/features/contract';
import { Button, Sheet, ToggleButton, ToggleGroup, ToggleGroupItem } from '@/features/ui';
import { DEV_FIXTURES_MARKER } from './marker';
import { FixtureChromeProvider } from './parts/FixtureSection';
import { DIRECTIONS, parseFixtureQuery, type Direction } from './query';
import { FIXTURE_SECTIONS } from './registry';

/**
 * The instrument surface root for the dev-only design-system fixtures (DS-08).
 *
 * Direction, reduced motion and hex token overrides come from the URL through the allowlist in
 * query.ts. The root carries data-surface="instrument", which is the only selector tokens.css
 * reacts to, so nothing outside this subtree (and the html element, through :has) changes.
 *
 * The chrome (header, contract pin, Direction switcher, Reduced motion toggle, section list) writes
 * the same two query parameters back with router.replace, so a reload restores what the toolbar
 * shows. At 1024 px and up the section list is a sticky left column; below 1024 px it opens from a
 * "Sections" button in a bottom Sheet (the kit dogfoods itself).
 */
const SURFACE_CLASS = 'min-h-screen bg-ground text-ink font-body';
const INDEX_PATH = '/dev/fixtures/';

const DIRECTION_LABELS: Record<Direction, string> = { atlas: 'Atlas', nocturne: 'Nocturne', poster: 'Poster' };

/** The URL hash, as an external store, so the current section link follows it without scroll-spy. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readHash() {
  return window.location.hash.replace(/^#/, '');
}

function ContractPin() {
  const model = useModelVersion();
  let text = 'Contract loading';
  if (model.data !== undefined) text = `Contract v${model.version} · ${model.data.model_version}`;
  else if (model.error !== null) text = 'Contract unavailable';
  return (
    <p className="font-data text-eyebrow text-muted" data-testid="contract-pin">
      {text}
    </p>
  );
}

function Header() {
  return (
    <header className="px-(--gutter) pt-6 pb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <h1 className="font-numeral text-title font-semibold">ReefRadar</h1>
      <p className="type-eyebrow text-muted">Fixtures · dev only</p>
      <div className="ms-auto">
        <ContractPin />
      </div>
    </header>
  );
}

/** The section links. `onNavigate` lets the phone Sheet close itself when a link is pressed. */
function SectionLinks({ section, query, onNavigate }: { section?: string; query: string; onNavigate?: () => void }) {
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => '');
  const single = section !== undefined;
  const base = 'inline-flex min-h-11 items-center font-data text-small hover:underline underline-offset-4';
  const current = 'text-accent underline decoration-2';

  return (
    <ul>
      {single ? (
        <li>
          <Link href={`${INDEX_PATH}${query}`} prefetch={false} className={clsx(base, 'text-ink')} onClick={onNavigate}>
            All sections
          </Link>
        </li>
      ) : null}
      {FIXTURE_SECTIONS.map(({ slug, title }) => {
        const isCurrent = single ? slug === section : slug === hash;
        const className = clsx(base, isCurrent ? current : 'text-ink');
        return (
          <li key={slug}>
            {single ? (
              <Link
                href={`${INDEX_PATH}${slug}/${query}`}
                prefetch={false}
                className={className}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={onNavigate}
              >
                {title}
              </Link>
            ) : (
              <a href={`#${slug}`} className={className} aria-current={isCurrent ? 'location' : undefined} onClick={onNavigate}>
                {title}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** At 1024 px and up: a sticky left column listing every section. */
function SectionNav({ section, query }: { section?: string; query: string }) {
  return (
    <nav
      aria-label="Fixture sections"
      className="hidden lg:block lg:sticky lg:top-6 lg:w-[200px] lg:shrink-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
    >
      <SectionLinks section={section} query={query} />
    </nav>
  );
}

/** Below 1024 px: a "Sections" button opens the same links in a bottom Sheet; a link press closes it. */
function PhoneSectionNav({ section, query }: { section?: string; query: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-8 lg:hidden">
      <Sheet
        side="bottom"
        title="Sections"
        isOpen={open}
        onOpenChange={setOpen}
        trigger={<Button variant="secondary">Sections</Button>}
      >
        <nav aria-label="Fixture sections">
          <SectionLinks section={section} query={query} onNavigate={() => setOpen(false)} />
        </nav>
      </Sheet>
    </div>
  );
}

/** Every registered section, or only the one whose slug is `section`. */
function Sections({ section }: { section?: string }) {
  const shown = section === undefined ? FIXTURE_SECTIONS : FIXTURE_SECTIONS.filter((def) => def.slug === section);
  return (
    <main className="min-w-0 flex-1 grid gap-20">
      {shown.map(({ slug, Component }) => (
        <Component key={slug} />
      ))}
    </main>
  );
}

function FixturesSurface({ section }: { section?: string }) {
  const router = useRouter();
  const pathname = usePathname();
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

  /** Writes one parameter and keeps every other one (tok overrides included). */
  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(name);
    else next.set(name, value);
    const qs = next.toString();
    router.replace(qs === '' ? pathname : `${pathname}?${qs}`, { scroll: false });
  };

  // Links to other sections keep the two switches the toolbar shows.
  const carried = new URLSearchParams();
  if (direction !== DIRECTIONS[0]) carried.set('direction', direction);
  if (reduced) carried.set('reduced', '1');
  const query = carried.toString() === '' ? '' : `?${carried.toString()}`;

  return (
    <div
      ref={rootRef}
      data-surface="instrument"
      data-direction={direction}
      data-reduced-motion={reduced ? 'true' : undefined}
      data-fixtures-marker={DEV_FIXTURES_MARKER}
      className={SURFACE_CLASS}
    >
      <RouterProvider navigate={(path) => router.push(path)}>
        <FixtureChromeProvider value={{ direction, reduced }}>
          <Header />
          <div className="rule-top-heavy px-(--gutter) py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-eyebrow text-muted">Direction</span>
              <ToggleGroup
                aria-label="Direction"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[direction]}
                onSelectionChange={(keys) => {
                  const [key] = [...keys];
                  const chosen = DIRECTIONS.find((candidate) => candidate === key);
                  if (chosen !== undefined) setParam('direction', chosen);
                }}
              >
                {DIRECTIONS.map((candidate) => (
                  <ToggleGroupItem key={candidate} id={candidate}>
                    {DIRECTION_LABELS[candidate]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <ToggleButton isSelected={reduced} onChange={(selected) => setParam('reduced', selected ? '1' : null)}>
              Reduced motion
            </ToggleButton>
          </div>
          <div className="px-(--gutter) pt-6 pb-24 lg:flex lg:items-start lg:gap-8">
            <PhoneSectionNav section={section} query={query} />
            <SectionNav section={section} query={query} />
            <Sections section={section} />
          </div>
        </FixtureChromeProvider>
      </RouterProvider>
    </div>
  );
}

/**
 * The Suspense fallback is the same surface with the atlas defaults, so the prerendered HTML
 * already carries data-surface and the page paints the atlas ground from the first frame instead
 * of flashing the legacy dark body colour until the query has been read on the client.
 */
function FixturesSurfaceFallback({ section }: { section?: string }) {
  return (
    <div
      data-surface="instrument"
      data-direction="atlas"
      data-fixtures-marker={DEV_FIXTURES_MARKER}
      className={SURFACE_CLASS}
    >
      <header className="px-(--gutter) pt-6 pb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h1 className="font-numeral text-title font-semibold">ReefRadar</h1>
        <p className="type-eyebrow text-muted">Fixtures · dev only</p>
      </header>
      <div className="rule-top-heavy px-(--gutter) pt-6 pb-24 lg:flex lg:items-start lg:gap-8">
        <Sections section={section} />
      </div>
    </div>
  );
}

export function FixturesApp({ section }: { section?: string }) {
  return (
    <Suspense fallback={<FixturesSurfaceFallback section={section} />}>
      <FixturesSurface section={section} />
    </Suspense>
  );
}
