'use client';

import clsx from 'clsx';
import { Fragment, useContext, useState, type ReactNode } from 'react';
import { Heading, OverlayTriggerStateContext, Popover, type PopoverProps } from 'react-aria-components';
import type { ContractSite } from '@/features/contract';
import { ErrorState, LoadingState, Skeleton, overlayContainer, type HabitatStatus } from '@/features/ui';
import { doiUrl, safeHttpsUrl } from './safe-url';

/**
 * WhyPanel, WhyPanelSurface and the panel data (DS-05, UI-SPEC "ProvenanceChip and Why panel").
 *
 * The panel answers "where does this come from" with a definition list: who assigned the label, what
 * it means (in quotes), the dataset, its DOI, the licence, the contract stamp's dataset and model
 * versions, the status basis (only when the status is unknown) and the recorder-clock time. Every
 * value comes from the data it is given. A field with no value is never dropped: the row stays and
 * reads "Not recorded", with the stored reason when the data has one (`doi_note` for a missing DOI,
 * `status_basis` for a missing definition). Nothing is invented to fill a row.
 *
 * Every link passes `safeHttpsUrl` (T-04-12-01): a dataset, DOI or licence URL that is not an
 * absolute https URL is shown as text. The DOI link is built on doi.org with `doiUrl`. The methods
 * destination is a path or an https URL, nothing else. Values wrap anywhere and are never cut with
 * an ellipsis; a site id gets a break opportunity after each underscore.
 *
 * `WhyPanel` is the content (heading and body) the live chip puts in its popover; `WhyPanelSurface`
 * draws the same framed panel as a plain element for the static cells of the fixtures route. Classes
 * are joined with `clsx`, not `cn` (see Button.tsx).
 */

export type WhyPanelKind = 'source' | 'label' | 'model' | 'missing';

export type WhyPanelState = 'default' | 'loading' | 'error';

/** What the panel shows. Every field is optional: an absent or null one reads "Not recorded". */
export interface WhyPanelData {
  siteId?: string | null;
  locationLabel?: string | null;
  /** The site's status; the status basis row shows when it is `unknown`. */
  status?: HabitatStatus | null;
  /** Who assigned the label (`label_assigned_by`). */
  assignedBy?: string | null;
  /** What the label means (`label_definition`). */
  definition?: string | null;
  datasetName?: string | null;
  datasetUrl?: string | null;
  doi?: string | null;
  /** Why the DOI is missing (`doi_note`). */
  doiNote?: string | null;
  licence?: string | null;
  licenceUrl?: string | null;
  /** The contract stamp's `dataset_version`. */
  datasetVersion?: string | null;
  /** The contract stamp's `model_version`. */
  modelVersion?: string | null;
  /** Why the status is what it is (`status_basis`); also the reason a definition is missing. */
  statusBasis?: string | null;
  /** The recorder-clock time of the recording, as "2022-08-30T12:00:00". */
  recordedAt?: string | null;
}

export const WHY_PANEL_TITLES: Record<WhyPanelKind, string> = {
  source: 'Source of this recording',
  label: 'Where this label comes from',
  model: 'Where this reading comes from',
  missing: 'Source of this recording',
};

export const DEFAULT_METHODS_HREF = '/about/';

/** The panel data for a contract site, plus what the contract stamp and the recording add. Missing values stay null. */
export function whyPanelDataFromSite(
  site: ContractSite,
  extra: { datasetVersion?: string | null; modelVersion?: string | null; recordedAt?: string | null },
): WhyPanelData {
  return {
    siteId: site.site_id,
    locationLabel: site.location_label,
    status: site.status,
    assignedBy: site.label_assigned_by,
    definition: site.label_definition,
    datasetName: site.dataset_name,
    datasetUrl: site.dataset_url,
    doi: site.doi,
    doiNote: site.doi_note,
    licence: site.licence,
    licenceUrl: site.licence_url,
    datasetVersion: extra.datasetVersion ?? null,
    modelVersion: extra.modelVersion ?? null,
    statusBasis: site.status_basis,
    recordedAt: extra.recordedAt ?? null,
  };
}

const present = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

/** "2022-08-30T12:00:00" as "2022-08-30 12:00 (recorder clock), timezone unverified". */
function recordedText(recordedAt: string): string {
  const [date, time] = recordedAt.split('T');
  const clock = time === undefined ? date : `${date} ${time.slice(0, 5)}`;
  return `${clock} (recorder clock), timezone unverified`;
}

/** Text with a break opportunity after each underscore, so an id wraps where it reads naturally. */
function BreakAfterUnderscores({ text }: { text: string }) {
  const parts = text.split('_');
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? (
            <>
              _<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

const LINK = 'text-accent underline underline-offset-2';

/** A new-tab link when the URL is a safe https URL; otherwise the label as plain text. */
function ExternalLink({ href, className, children }: { href: string | null | undefined; className?: string; children: ReactNode }) {
  const safe = safeHttpsUrl(href);
  if (safe === undefined) return <span className={className}>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={clsx(LINK, className)}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function NotRecorded({ reason }: { reason?: string | null }) {
  return (
    <>
      <span>Not recorded</span>
      {present(reason) ? <span className="mt-1 block text-small text-muted">{reason}</span> : null}
    </>
  );
}

interface Row {
  term: string;
  value: ReactNode;
}

function rowsOf(data: WhyPanelData): Row[] {
  const rows: Row[] = [
    { term: 'Assigned by', value: present(data.assignedBy) ? data.assignedBy : <NotRecorded /> },
    {
      term: 'Definition',
      value: present(data.definition) ? `“${data.definition}”` : <NotRecorded reason={data.statusBasis} />,
    },
    {
      term: 'Dataset',
      value: present(data.datasetName) ? <ExternalLink href={data.datasetUrl}>{data.datasetName}</ExternalLink> : <NotRecorded />,
    },
    {
      term: 'DOI',
      value: present(data.doi) ? (
        <ExternalLink href={doiUrl(data.doi)} className="font-data">
          {data.doi}
        </ExternalLink>
      ) : (
        <NotRecorded reason={data.doiNote} />
      ),
    },
    {
      term: 'Licence',
      value: present(data.licence) ? <ExternalLink href={data.licenceUrl}>{data.licence}</ExternalLink> : <NotRecorded />,
    },
    {
      term: 'Dataset version',
      value: present(data.datasetVersion) ? <span className="font-data">{data.datasetVersion}</span> : <NotRecorded />,
    },
    {
      term: 'Model version',
      value: present(data.modelVersion) ? <span className="font-data">{data.modelVersion}</span> : <NotRecorded />,
    },
  ];
  if (data.status === 'unknown' || present(data.statusBasis)) {
    rows.push({ term: 'Status basis', value: present(data.statusBasis) ? data.statusBasis : <NotRecorded /> });
  }
  rows.push({ term: 'Recorded', value: present(data.recordedAt) ? recordedText(data.recordedAt) : <NotRecorded /> });
  return rows;
}

/** A methods destination is a path on this site or an https URL; anything else is dropped. */
function safeMethodsHref(href: string): string | undefined {
  if (/^\/(?!\/)/.test(href)) return href;
  return safeHttpsUrl(href);
}

function MethodsLink({ href }: { href: string }) {
  const safe = safeMethodsHref(href);
  if (safe === undefined) return null;
  return (
    <a href={safe} className={clsx(LINK, 'hit-area inline-block')}>
      Methods and limits
    </a>
  );
}

/** The site id (broken after underscores) and its place, under the panel's title. */
function Identity({ data }: { data: WhyPanelData }) {
  if (!present(data.siteId) && !present(data.locationLabel)) return null;
  return (
    <p className="mt-1 text-small text-muted wrap-anywhere">
      {present(data.siteId) ? (
        <span data-site-id="" className="font-data">
          <BreakAfterUnderscores text={data.siteId} />
        </span>
      ) : null}
      {present(data.siteId) && present(data.locationLabel) ? ' · ' : null}
      {present(data.locationLabel) ? <span>{data.locationLabel}</span> : null}
    </p>
  );
}

export interface WhyPanelBodyProps {
  panel: WhyPanelData;
  state?: WhyPanelState;
  methodsHref?: string;
  onRetry?: () => void;
}

/** The definition list and the footer link, or the loading or error state that replaces them. */
export function WhyPanelBody({ panel, state = 'default', methodsHref = DEFAULT_METHODS_HREF, onRetry }: WhyPanelBodyProps) {
  if (state === 'loading') {
    return (
      <LoadingState label="Loading provenance…" className="mt-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </LoadingState>
    );
  }
  if (state === 'error') {
    const safe = safeMethodsHref(methodsHref);
    return (
      <ErrorState
        announce="status"
        headingLevel={4}
        title="Provenance could not be loaded."
        body="Try again, or open Methods and limits."
        onRetry={onRetry}
        link={safe === undefined ? undefined : { label: 'Methods and limits', href: safe }}
        className="mt-4"
      />
    );
  }
  return (
    <>
      <dl className="mt-4 grid gap-4">
        {rowsOf(panel).map((row) => (
          <div key={row.term}>
            <dt className="type-eyebrow text-muted">{row.term}</dt>
            <dd className="text-body wrap-anywhere">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 border-t border-rule pt-4">
        <MethodsLink href={methodsHref} />
      </p>
    </>
  );
}

const TITLE = 'font-numeral text-lead font-normal text-ink';

/** The frame: ground, a 1 px ink border all round, the heavy rule on top, no shadow. */
export const WHY_PANEL_FRAME = 'bg-ground text-ink font-body text-body border border-ink rule-top-heavy p-5 max-w-[360px]';

export interface WhyPanelProps extends WhyPanelBodyProps {
  kind: WhyPanelKind;
}

/**
 * The panel's content for a live overlay: a `Heading slot="title"` (the dialog's name), the identity
 * line and the body. Put it inside a React Aria `Dialog`.
 */
export function WhyPanel({ kind, ...body }: WhyPanelProps) {
  return (
    <>
      <Heading slot="title" className={TITLE}>
        {WHY_PANEL_TITLES[kind]}
      </Heading>
      <Identity data={body.panel} />
      <WhyPanelBody {...body} />
    </>
  );
}

export interface WhyPanelSurfaceProps extends WhyPanelProps {
  /** The heading element, so the page outline stays honest (the live title is an h2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** The framed panel as a plain element (no overlay, no role), for static cells. `className` sizes it. */
export function WhyPanelSurface({ kind, headingLevel = 3, className, ...body }: WhyPanelSurfaceProps) {
  const HeadingTag = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div data-why-panel-surface="" data-kind={kind} className={clsx(WHY_PANEL_FRAME, 'w-full', className)}>
      <HeadingTag className={TITLE}>{WHY_PANEL_TITLES[kind]}</HeadingTag>
      <Identity data={body.panel} />
      <WhyPanelBody {...body} />
    </div>
  );
}

/** The identity line for a panel drawn inside another surface (the phone Sheet), which supplies the title. */
export function WhyPanelContent({ panel, ...body }: WhyPanelBodyProps) {
  return (
    <>
      <Identity data={panel} />
      <WhyPanelBody panel={panel} {...body} />
    </>
  );
}

/**
 * A Popover that portals into the instrument surface (so the font and token variables reach it).
 * The surface root is looked up when it opens, not when the trigger first renders (see
 * SurfaceModalOverlay in features/ui/Dialog.tsx).
 */
export function SurfacePopover(props: Omit<PopoverProps, 'UNSTABLE_portalContainer'>) {
  const open = useContext(OverlayTriggerStateContext)?.isOpen === true;
  const [held, setHeld] = useState<HTMLElement | undefined>(undefined);
  if (open && (held === undefined || !held.isConnected)) {
    const next = overlayContainer();
    if (next !== held) setHeld(next);
  }
  return <Popover {...props} UNSTABLE_portalContainer={held} />;
}
