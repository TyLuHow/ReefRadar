'use client';

import { useState } from 'react';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { StatusBand } from '@/features/instrument';
import { ErrorState, HABITAT_STATUSES, LoadingState, STATUS_LABELS, Skeleton, TooltipSurface, countBy, type HabitatStatus } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * StatusBand (DS-05): every contract reference site, with segment sizes and counts computed by
 * countBy over the data. The interactive cell is live (press a segment to toggle it); the selected
 * cell starts with one status on. The hover cell forces the hover treatment on one segment of real
 * data and draws the tooltip it would open, beside the band. The phone cell is the same band in a
 * 390 px container, where the labels move to a two-column grid under the band.
 */

export const STATUS_BAND_META: FixtureSectionMeta = {
  slug: 'status-band',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'StatusBand',
  contract:
    'One bar of habitat statuses with each segment sized by its count of sites, a mark, a count and a label under each, and no segment for a status with no sites. With a handler each segment is a toggle; selected has an inset ink outline and hover an ink bottom edge.',
  data: 'contract sites.json through useReferenceSites (status); every segment size and count is computed by countBy over those sites',
};

const PHONE_WIDTH_CLASS = 'w-[390px] max-w-full';

const statusOf = (site: ContractSite): HabitatStatus => site.status;

function LiveBand({ sites, initial }: { sites: readonly ContractSite[]; initial: HabitatStatus[] }) {
  const [selected, setSelected] = useState<HabitatStatus[]>(initial);
  return (
    <StatusBand
      items={sites}
      statusOf={statusOf}
      selected={selected}
      onSelect={(status) => setSelected((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]))}
    />
  );
}

function noop() {
  /* a review cell: hover is forced, nothing to select */
}

function DataCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const all = sites.data;
    const counts = countBy(all, statusOf);
    const present = HABITAT_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0);
    const selectedStatus = present.includes('healthy') ? 'healthy' : present[0];
    const hoverStatus = present.includes('restored_early') ? 'restored_early' : present[0];
    const hoverCount = counts.get(hoverStatus) ?? 0;
    const version = sites.version ?? '?';
    const note = `All ${all.length} sites from contract v${version}.`;

    return (
      <>
        <StateCell primitive="status-band" state="default" span="full" note={note}>
          <StatusBand items={all} statusOf={statusOf} />
        </StateCell>
        <StateCell primitive="status-band" state="selected" span="full" note={`${note} Press a segment to toggle it; ${STATUS_LABELS[selectedStatus]} starts on.`}>
          <LiveBand sites={all} initial={[selectedStatus]} />
        </StateCell>
        <StateCell primitive="status-band" state="hover" forced span="full" note={`${note} The ${STATUS_LABELS[hoverStatus]} segment shows the hover edge and the tooltip it opens.`}>
          <div className="flex flex-col gap-3">
            <StatusBand items={all} statusOf={statusOf} onSelect={noop} forcedHover={hoverStatus} />
            <div className="w-fit">
              <TooltipSurface>{`${STATUS_LABELS[hoverStatus]}: ${hoverCount} ${hoverCount === 1 ? 'site' : 'sites'}`}</TooltipSurface>
            </div>
          </div>
        </StateCell>
        <StateCell primitive="status-band" state="phone" note={`${note} In a 390 px container the labels sit in a two-column grid under the band.`}>
          <div className={PHONE_WIDTH_CLASS}>
            <StatusBand items={all} statusOf={statusOf} />
          </div>
        </StateCell>
      </>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="status-band" state="data-error">
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
    <StateCell primitive="status-band" state="data-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function StatusBandSection() {
  return (
    <FixtureSection {...STATUS_BAND_META}>
      <DataCells />
      <StateCell primitive="status-band" state="loading" span="full">
        <StatusBand items={[]} statusOf={statusOf} state="loading" />
      </StateCell>
      <StateCell primitive="status-band" state="empty">
        <StatusBand items={[]} statusOf={statusOf} state="empty" />
      </StateCell>
    </FixtureSection>
  );
}
