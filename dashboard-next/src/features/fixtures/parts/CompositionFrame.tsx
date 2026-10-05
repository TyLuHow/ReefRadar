'use client';

import type { ReactNode } from 'react';
import { InstrumentHeader, type InstrumentDestination } from '@/features/instrument';
import { useContract, useReferenceSites, type ContractSite } from '@/features/contract';

/**
 * What the four compositions share on the fixtures route (04-21): a frame that is one screen
 * (`data-screen`, so the AccentBlock check counts its blocks per composition) and carries the
 * fixtures markers, and the header fed from the contract.
 */

/** One composition, edge to edge across the grid, on the ground with a hairline frame. */
export function CompositionFrame({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <div
      data-fixture-primitive={slug}
      data-fixture-state="default"
      data-screen={`${slug}/default`}
      className="col-span-full min-w-0 border border-rule bg-ground text-ink"
    >
      {children}
    </div>
  );
}

/** The header with the contract version and the site count read from the contract (never typed). */
export function CompositionHeader({ current }: { current: InstrumentDestination }) {
  const sites = useReferenceSites();
  const contract = useContract();
  const version = contract.version ?? sites.version;
  return <InstrumentHeader current={current} contractVersion={version} siteCount={sites.data?.length} />;
}

/** The contract site with an id, or undefined while it loads or when it is not in the contract. */
export function findSite(sites: readonly ContractSite[] | undefined, siteId: string): ContractSite | undefined {
  return sites?.find((site) => site.site_id === siteId);
}
