'use client';

import clsx from 'clsx';
import { useId, type ReactNode } from 'react';
import { toIntegerPercentages } from '@/lib/probabilities';
import { ErrorState, EmptyState, HABITAT_STATUSES, LoadingState, STATUS_BG_CLASS, STATUS_LABELS, Skeleton, StatusMark, type HabitatStatus } from '@/features/ui';
import { RLabel } from './RLabel';

/**
 * ProbabilityBar (DS-05, UI-SPEC "ProbabilityBar (with abstain)").
 *
 * What the model returned, and nothing else. Each row is a class, its integer percentage and a bar.
 * The percentages come from `toIntegerPercentages` over the classes drawn, so they are integers that
 * sum to 100; the probabilities are never scaled, floored, boosted or smoothed, and this is a model
 * reading, never a diagnosis. Rows are ordered by the raw probability, largest first. Only the
 * classes the model has are drawn (`modelClasses`, from the model card): the interim model has no
 * restored_mid, and a class it does not have is absent, not a zero row.
 *
 * Under the bars, in order: the classes the model has; the optional caller note (the fixtures put
 * the source of the reading here); when a reference label exists, who assigned it and the model's
 * highest probability, then a computed sentence that says whether they differ or match (a match
 * confirms nothing, and the limits line follows either way); and the limits line from the model
 * card: what it was trained on and, when `evaluation` is null, that it has not been tested on
 * recordings from new sites. Every count and name in those sentences is computed from the data.
 *
 * Abstain (`abstain` prop, set by the caller when the reading says the model withheld a verdict):
 * the heading is "Can't tell" beside a hollow ring, the bars are neutral hatching with no habitat
 * status colour and no class mark, so no class looks like a winner, and the comparison and verdict
 * are not drawn (there is no highest probability to compare). The threshold sentence is printed only
 * when a threshold is known; `threshold` is a probability from 0 to 1. The interim model has no
 * abstain threshold, so only the fixtures route forces this state.
 *
 * Accessibility: the wrapper is a `group` named "Model reading: class probabilities" and described by
 * a text summary ("Healthy 58%, ..."); the bars are `aria-hidden`; the status marks are decoration.
 * Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom
 * colour and size names (see Button.tsx).
 */

export type ProbabilityBarState = 'default' | 'loading' | 'empty' | 'error';

export interface ProbabilityBarReference {
  status: HabitatStatus;
  /** The label as the dataset's authors named it; defaults to the status name. */
  label?: string;
  /** Who assigned it ("MARRS research team (Williams, Jones et al. 2025)"). */
  assignedBy: string;
}

export interface ProbabilityBarModelCard {
  /** `training.rows`: the number of windows the model was trained on. */
  rows: number;
  /** `training.sites`. */
  sites: readonly string[];
  /** `training.countries`. */
  countries: readonly string[];
  /** `evaluation`: null unless a grouped, site-held-out evaluation exists. */
  evaluation: unknown | null;
}

export interface ProbabilityBarProps {
  /** The model's probabilities as returned, by class. */
  probabilities: Partial<Record<string, number>>;
  /** The classes the model has (the model card's `classes`). */
  modelClasses: readonly string[];
  reference?: ProbabilityBarReference;
  modelCard: ProbabilityBarModelCard;
  /** Set when the model withheld a reading. `threshold` (0 to 1) is printed only when known. */
  abstain?: { threshold?: number };
  state?: ProbabilityBarState;
  /** A line under the bars (the fixtures state where the reading came from). */
  note?: ReactNode;
  onRetry?: () => void;
  /** The heading element for "Can't tell", so the page outline stays honest. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const SKELETON_ROWS = 3;
const MIN_FILL_PX = '2px';

/** The model-card classes that are habitat statuses (the contract's class names are the same ids). */
function knownStatuses(names: readonly string[]): HabitatStatus[] {
  return names.filter((name): name is HabitatStatus => (HABITAT_STATUSES as readonly string[]).includes(name));
}

/** "restored early": the status name in running text (lower case, no brackets). */
function plainLabel(status: HabitatStatus): string {
  return STATUS_LABELS[status].toLowerCase().replace(/[()]/g, '');
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "A", "A and B", "A, B and C". */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface Row {
  status: HabitatStatus;
  probability: number;
  percent: number;
  /** The class's share of the displayed total, 0 to 100, for the bar length. */
  share: number;
}

/** Rows for the classes the model has that the reading holds a probability for, largest first. */
function buildRows(probabilities: ProbabilityBarProps['probabilities'], modelClasses: readonly string[]): Row[] {
  const classes = knownStatuses(modelClasses).filter((status) => typeof probabilities[status] === 'number');
  const drawn: Partial<Record<HabitatStatus, number>> = {};
  for (const status of classes) drawn[status] = probabilities[status] as number;
  const percents = toIntegerPercentages(drawn);
  const total = classes.reduce((sum, status) => sum + (drawn[status] ?? 0), 0);
  return classes
    .map((status, index) => ({ status, index, probability: drawn[status] ?? 0 }))
    .sort((a, b) => b.probability - a.probability || a.index - b.index)
    .map(({ status, probability }) => ({
      status,
      probability,
      percent: percents[status] ?? 0,
      share: total > 0 ? (probability / total) * 100 : 0,
    }));
}

const HATCH = 'repeating-linear-gradient(45deg, var(--dir-rule-strong) 0 2px, transparent 2px 6px)';

function ProbabilityRow({ row, abstain }: { row: Row; abstain: boolean }) {
  return (
    <div data-class={row.status}>
      <div className="flex items-center gap-3">
        {abstain ? null : <StatusMark status={row.status} size={20} className="shrink-0" />}
        <span className="text-body text-ink flex-1">{STATUS_LABELS[row.status]}</span>
        <span data-percent={row.percent} className="font-data text-body tabular text-ink text-end">{`${row.percent}%`}</span>
      </div>
      <div data-bar aria-hidden="true" className="bg-track border-rule-strong mt-1 h-3 rounded-surface border-b">
        {row.probability > 0 ? (
          <div
            data-bar-fill
            data-hatched={abstain ? 'true' : undefined}
            className={clsx('h-full rounded-surface', abstain ? null : STATUS_BG_CLASS[row.status])}
            style={{ width: `${row.share}%`, minWidth: MIN_FILL_PX, ...(abstain ? { backgroundImage: HATCH } : null) }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** The model reading: class probabilities as returned, the reference label beside them, and the model's limits. */
export function ProbabilityBar({
  probabilities,
  modelClasses,
  reference,
  modelCard,
  abstain,
  state = 'default',
  note,
  onRetry,
  headingLevel = 3,
  className,
}: ProbabilityBarProps) {
  const summaryId = useId();
  const rows = buildRows(probabilities, modelClasses);

  const header = (
    <RLabel kind="model">
      <p className="text-small text-muted">Class probabilities as returned by the model</p>
    </RLabel>
  );

  let body: ReactNode;
  if (state === 'loading') {
    body = (
      <LoadingState label="Loading model reading…">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </LoadingState>
    );
  } else if (state === 'error') {
    body = (
      <ErrorState
        announce="status"
        title="The model reading could not be loaded."
        body="The recording and its reference label are unaffected."
        onRetry={onRetry}
        headingLevel={headingLevel}
      />
    );
  } else if (state === 'empty' || rows.length === 0) {
    body = <EmptyState title="No model reading." body="A reading appears after the recording has been analysed." />;
  } else {
    const top = rows[0];
    const summary = rows
      .map((row, index) => `${index === 0 ? sentenceCase(plainLabel(row.status)) : plainLabel(row.status)} ${row.percent}%`)
      .join(', ');
    const abstained = abstain !== undefined;
    const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
    const referenceLabel = reference ? (reference.label ?? STATUS_LABELS[reference.status]) : null;
    const classNote = `Classes this model has: ${knownStatuses(modelClasses).map(plainLabel).join(', ')}.`;
    const trained = `This model was trained on ${plural(modelCard.rows, 'window', 'windows')} from ${plural(modelCard.sites.length, 'site', 'sites')}${
      modelCard.countries.length > 0 ? ` in ${listOf(modelCard.countries)}` : ''
    }.`;

    body = (
      <div
        role="group"
        aria-label="Model reading: class probabilities"
        aria-describedby={summaryId}
        data-abstain={abstained ? 'true' : undefined}
        className="flex flex-col gap-4"
      >
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
        {abstained ? (
          <div className="flex items-start gap-3">
            <StatusMark status="unknown" size={20} className="mt-1 shrink-0" />
            <div>
              <Heading className="text-lead font-semibold text-ink">{"Can't tell"}</Heading>
              <p className="text-body text-ink">
                The model withheld a reading for this recording. Probabilities are shown as returned and are not a reading.
              </p>
              {abstain.threshold !== undefined ? (
                <p className="text-body text-ink">{`No class reached the ${Math.round(abstain.threshold * 100)}% abstain threshold.`}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ProbabilityRow key={row.status} row={row} abstain={abstained} />
          ))}
        </div>
        <p className="text-small text-muted">{classNote}</p>
        {note ? <p className="text-small text-muted">{note}</p> : null}
        <div className="border-rule flex flex-col gap-1 border-t pt-3">
          {reference && referenceLabel !== null ? (
            <p className="text-body text-ink">{`Reference label: ${referenceLabel}, assigned by ${reference.assignedBy}.`}</p>
          ) : null}
          {reference && !abstained ? (
            <>
              <p className="text-body text-ink">{`Model's highest probability: ${STATUS_LABELS[top.status]} ${top.percent}%.`}</p>
              <p className="text-body font-semibold text-ink">
                {top.status === reference.status
                  ? `The model's highest probability, ${STATUS_LABELS[top.status]}, matches the reference label.`
                  : `The model's highest probability, ${STATUS_LABELS[top.status]}, differs from the reference label, ${STATUS_LABELS[reference.status]}.`}
              </p>
            </>
          ) : null}
          <p className="text-body text-ink">{trained}</p>
          {modelCard.evaluation === null ? <p className="text-body text-ink">It has not been tested on recordings from new sites.</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-4 text-start', className)}>
      {header}
      {body}
    </div>
  );
}
