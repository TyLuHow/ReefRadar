import clsx from 'clsx';

/**
 * InstrumentHeader (DS-05, UI-SPEC "Expressive Compositions", Header): the wordmark, the five
 * destinations, a contract chip and a 3 px heavy rule under them. Shared by the four compositions.
 *
 * The destinations are not built in this phase, so each link is an in-page hash; the current one is
 * marked `aria-current="page"`, in the accent colour with a 2 px underline. The chip reads
 * "Contract v{version} · {n} sites" from props the caller computed from the contract (a loading
 * contract reads "Contract loading"); nothing here is a typed figure. The wordmark is a paragraph,
 * not a heading, so the page outline belongs to the composition's own headline. Classes are joined
 * with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom size names (see Button.tsx).
 */

export const INSTRUMENT_DESTINATIONS = ['Listen', 'Explore', 'Compare', 'Analyze', 'Methods'] as const;
export type InstrumentDestination = (typeof INSTRUMENT_DESTINATIONS)[number];

export interface InstrumentHeaderProps {
  current: InstrumentDestination;
  /** The contract version in use, from the contract hooks. */
  contractVersion?: number | string;
  /** How many reference sites the contract holds, counted from the sites artifact. */
  siteCount?: number;
}

/** "Contract v1 · 12 sites"; "1 site" for one; "Contract loading" until the contract has arrived. */
export function contractChipText(contractVersion: number | string | undefined, siteCount: number | undefined): string {
  if (contractVersion === undefined || siteCount === undefined) return 'Contract loading';
  return `Contract v${contractVersion} · ${siteCount} ${siteCount === 1 ? 'site' : 'sites'}`;
}

const LINK = 'inline-flex min-h-11 min-w-11 items-center justify-center text-body underline-offset-8 hover:underline';

export function InstrumentHeader({ current, contractVersion, siteCount }: InstrumentHeaderProps) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-3">
        <p className="font-numeral text-title font-semibold">ReefRadar</p>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-6">
          {INSTRUMENT_DESTINATIONS.map((destination) => {
            const isCurrent = destination === current;
            return (
              <a
                key={destination}
                // Not built in this phase: an in-page hash. The prefix keeps it from matching a fixtures section id.
                href={`#page-${destination.toLowerCase()}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={clsx(LINK, isCurrent ? 'text-accent font-semibold underline decoration-2' : 'text-ink')}
              >
                {destination}
              </a>
            );
          })}
        </nav>
        <p className="font-data text-eyebrow text-muted ms-auto">{contractChipText(contractVersion, siteCount)}</p>
      </div>
      <div aria-hidden="true" className="rule-top-heavy" />
    </header>
  );
}
