'use client';

import { useContract, useModelVersion, useReferenceSites, type ContractSite } from '@/features/contract';
import { ProvenanceChip, WhyPanelContent, WhyPanelSurface, whyPanelDataFromSite, type WhyPanelData } from '@/features/instrument';
import { allExcerpts } from '@/lib/audio-manifest';
import { ErrorState, LoadingState, SheetSurface, Skeleton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * ProvenanceChip and the Why panel (DS-05). Everything shown is a field of the real contract: the
 * chips and the panel are built from ind_H1's contract site (dataset, DOI, licence, who assigned the
 * label and what it means), the contract stamp's dataset and model versions (the manifest and
 * `useModelVersion`) and the recorder-clock time of ind_H1's committed excerpt (audio manifest).
 * The MISSING cell is the first contract site whose DOI is null, so the "Not recorded" row and the
 * stored `doi_note` reason are real; the LONG TEXT cell is the site with the longest real label
 * definition. If the contract has no site with a null DOI, the MISSING cell falls back to the
 * `missing` kind with every field absent. The EMPTY cell is that `missing` kind.
 *
 * The live chips open the real Popover (the Sheet below 640 px); the open, loading, error, long text
 * and phone cells draw the same panel statically, because a live overlay portals out of its cell.
 */

export const PROVENANCE_META: FixtureSectionMeta = {
  slug: 'provenance',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'ProvenanceChip and Why panel',
  contract:
    'A chip says where something comes from and opens a panel with who assigned the label, what it means, the dataset, DOI, licence and the contract stamp. A missing field reads "Not recorded" with its stored reason; links are https only.',
  data: 'contract sites.json through useReferenceSites (ind_H1; the first site with a null doi and its doi_note; the longest label_definition); contract manifest dataset_version and useModelVersion model_version; data/audio-manifest.json recorded_at_recorder_clock',
};

const FOCUS_SITE_ID = 'ind_H1';
const PHONE_WIDTH_CLASS = 'w-[390px] max-w-full';

function noop() {
  /* a review page has nothing to retry */
}

function longestDefinition(sites: readonly ContractSite[]): ContractSite | undefined {
  return sites.reduce<ContractSite | undefined>(
    (best, site) => ((site.label_definition?.length ?? 0) > (best?.label_definition?.length ?? 0) ? site : best),
    undefined,
  );
}

interface Stamp {
  datasetVersion: string;
  modelVersion: string;
}

/** The recorder-clock time of the committed excerpt of a site, if the app carries one. */
function recordedAtFor(siteId: string): string | null {
  return allExcerpts().find((excerpt) => excerpt.site_id === siteId)?.recorded_at_recorder_clock ?? null;
}

function dataFor(site: ContractSite, stamp: Stamp): WhyPanelData {
  return whyPanelDataFromSite(site, { ...stamp, recordedAt: recordedAtFor(site.site_id) });
}

function Cells() {
  const sites = useReferenceSites();
  const contract = useContract();
  const model = useModelVersion();

  const failed = sites.error ?? contract.error ?? model.error;
  const loaded = sites.data;
  const datasetVersion = contract.data?.dataset_version;
  const modelVersion = model.data?.model_version;

  if (failed !== null && failed !== undefined) {
    return (
      <StateCell primitive="provenance" state="data-error">
        <ErrorState
          announce="status"
          title="The contract could not be loaded."
          body="Try again, or reload the page."
          onRetry={() => {
            void Promise.all([sites.refetch(), contract.refetch(), model.refetch()]);
          }}
        />
      </StateCell>
    );
  }

  const focusSite = loaded?.find((site) => site.site_id === FOCUS_SITE_ID);
  if (loaded === undefined || datasetVersion === undefined || modelVersion === undefined || focusSite === undefined) {
    return (
      <StateCell primitive="provenance" state="data-loading">
        <LoadingState label="Loading provenance…">
          <Skeleton on="panel" className="h-40 w-full" />
        </LoadingState>
      </StateCell>
    );
  }

  const stamp: Stamp = { datasetVersion, modelVersion };
  const focus = dataFor(focusSite, stamp);
  const nullDoiSite = loaded.find((site) => site.doi === null);
  const partial: WhyPanelData = nullDoiSite ? dataFor(nullDoiSite, stamp) : {};
  const longSite = longestDefinition(loaded) ?? focusSite;
  const longData = dataFor(longSite, stamp);
  const version = sites.version ?? '?';
  const forcedNote = `ind_H1 from contract v${version}.`;

  return (
    <>
      <StateCell
        primitive="provenance"
        state="default"
        span="full"
        note={`${forcedNote} Press a chip (or focus it and press Enter) to open its panel; Escape closes it and focus returns to the chip.`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <ProvenanceChip kind="source" panel={focus} />
          <ProvenanceChip kind="label" panel={focus} />
          <ProvenanceChip kind="model" panel={focus} />
        </div>
      </StateCell>
      <StateCell primitive="provenance" state="hover" forced note={forcedNote}>
        <ProvenanceChip kind="source" panel={focus} forced="hover" />
      </StateCell>
      <StateCell primitive="provenance" state="focus" forced note={forcedNote}>
        <ProvenanceChip kind="source" panel={focus} forced="focus" />
      </StateCell>
      <StateCell primitive="provenance" state="pressed" forced note={forcedNote}>
        <ProvenanceChip kind="source" panel={focus} forced="pressed" />
      </StateCell>
      <StateCell
        primitive="provenance"
        state="active-open"
        note="The chip in its open look above the panel drawn with WhyPanelSurface; the live chips in the default cell open the real popover."
      >
        <div className="flex flex-col items-start gap-3">
          <ProvenanceChip kind="label" panel={focus} forced="open" />
          <WhyPanelSurface kind="label" panel={focus} methodsHref="/about/" />
        </div>
      </StateCell>
      <StateCell
        primitive="provenance"
        state="missing"
        note={
          nullDoiSite
            ? `${nullDoiSite.site_id} has no DOI in its dataset: the DOI row stays and reads "Not recorded" with the stored reason.`
            : 'No contract site has a null DOI; the missing kind is shown with every field absent.'
        }
      >
        <div className="flex flex-col items-start gap-3">
          <ProvenanceChip kind={nullDoiSite ? 'source' : 'missing'} panel={partial} />
          <WhyPanelSurface kind={nullDoiSite ? 'source' : 'missing'} panel={partial} methodsHref="/about/" />
        </div>
      </StateCell>
      <StateCell primitive="provenance" state="loading" note="A skeleton chip, and the panel with skeleton rows.">
        <div className="flex flex-col items-start gap-3">
          <ProvenanceChip kind="label" panel={{}} state="loading" />
          <WhyPanelSurface kind="label" panel={{}} state="loading" />
        </div>
      </StateCell>
      <StateCell primitive="provenance" state="empty" note="Nothing is known about the source: the missing kind, never a disabled chip.">
        <ProvenanceChip kind="missing" panel={{}} />
      </StateCell>
      <StateCell primitive="provenance" state="error">
        <WhyPanelSurface kind="label" panel={{}} state="error" onRetry={noop} methodsHref="/about/" />
      </StateCell>
      <StateCell
        primitive="provenance"
        state="long-text"
        note={`${longSite.site_id} has the longest real label definition (${longSite.label_definition?.length ?? 0} characters). It wraps inside the panel and is never cut.`}
      >
        <WhyPanelSurface kind="label" panel={longData} methodsHref="/about/" />
      </StateCell>
      <StateCell primitive="provenance" state="phone" note="Below 640 px the panel opens as a bottom sheet; drawn here at 390 px.">
        <SheetSurface side="bottom" title="Where this label comes from" className={PHONE_WIDTH_CLASS}>
          <WhyPanelContent panel={focus} methodsHref="/about/" />
        </SheetSurface>
      </StateCell>
    </>
  );
}

export function ProvenanceSection() {
  return (
    <FixtureSection {...PROVENANCE_META}>
      <Cells />
    </FixtureSection>
  );
}
