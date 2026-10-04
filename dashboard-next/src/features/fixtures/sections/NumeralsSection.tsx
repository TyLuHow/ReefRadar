'use client';

import { useReferenceSites } from '@/features/contract';
import { BandSection, Stat, AccentBlock } from '@/features/instrument';
import { ErrorState, LinkButton, LoadingState, Skeleton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Numerals, AccentBlock and BandSection (DS-05). The two numerals are computed from the contract
 * sites with useReferenceSites (the number of sites, and the number of distinct countries among
 * them); nothing is typed. While the contract loads the numerals cell shows a loading state, and if
 * it fails it shows an error state with a Retry that asks the contract again. The accent block and
 * the band carry the Listen composition copy from UI-SPEC and no recording: this section reviews
 * the surfaces, not a claim about a recording.
 */

export const NUMERALS_META: FixtureSectionMeta = {
  slug: 'numerals',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'Numerals, AccentBlock, BandSection',
  contract:
    'A numeral is a number a caller computed from data, set very large beside a short label. An accent block is one solid surface with a lead, a sentence and one action, and a screen holds at most the count its direction allows. A band is a full-width section with an eyebrow and a display headline.',
  data: 'contract sites.json through useReferenceSites (site count and distinct country count, computed); UI-SPEC "Expressive Compositions" copy for the accent block and the band',
};

function NumeralCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const siteCount = sites.data.length;
    const countryCount = new Set(sites.data.map((site) => site.country)).size;
    return (
      <StateCell
        primitive="numerals"
        state="stats"
        note={`Computed from contract v${sites.version ?? '?'}: ${siteCount} sites in ${countryCount} countries.`}
      >
        <div className="flex flex-col gap-6">
          <Stat value={siteCount} label="reference sites" />
          <Stat value={countryCount} label="countries" />
        </div>
      </StateCell>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="numerals" state="error">
        <ErrorState
          announce="status"
          title="The reference sites could not be loaded."
          body="Try again, or reload the page."
          onRetry={() => {
            void sites.refetch();
          }}
        />
      </StateCell>
    );
  }

  return (
    <StateCell primitive="numerals" state="loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-16 w-1/2" />
        <Skeleton on="panel" className="h-16 w-1/2" />
      </LoadingState>
    </StateCell>
  );
}

export function NumeralsSection() {
  return (
    <FixtureSection {...NUMERALS_META}>
      <NumeralCells />
      <StateCell primitive="numerals" state="accent-block" note="One block in this cell, which is the screen boundary for the per-screen count.">
        <AccentBlock
          lead="Have a recording of your own?"
          sentence="Place it among labelled reference recordings to hear how it compares."
          action={
            <LinkButton variant="inverse" tone="accent" href="#place-a-recording">
              Place a recording
            </LinkButton>
          }
        />
      </StateCell>
      <StateCell
        primitive="numerals"
        state="band-section"
        span="full"
        note="Eyebrow and headline are the Listen composition copy; no recording is attached to this cell."
      >
        <BandSection as="div" eyebrow="A real recording · nothing synthetic" headline="This is what a reef sounds like." headingLevel={3} className="p-8" />
      </StateCell>
    </FixtureSection>
  );
}
