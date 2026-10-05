'use client';

import clsx from 'clsx';
import { Fragment, type ReactNode, type Ref } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { Button, EmptyState, ErrorState, LoadingState, Skeleton, StatusMark, type HabitatStatus } from '@/features/ui';
import { formatGain } from './compare-math';
import { formatDb } from './ColourBar';
import { RLabel } from './RLabel';
import { Spectrogram, type SpectrogramCaption, type SpectrogramHandle } from './Spectrogram';
import type { SpectrogramMatrix } from './dsp';

/**
 * CompareRow (DS-05, UI-SPEC "CompareRow and CompareDeck"): one clip of a comparison, a big slot
 * letter, an identity block and a `compare` Spectrogram well.
 *
 * The identity block carries what a person needs to trust the row, all from the committed manifest:
 * the site id, the status mark with the dataset's own label, the label's definition in quotes and who
 * assigned it (inside an R-LABEL solid rule, because it is a reference label, never a model output),
 * the recorder-clock time with "timezone unverified", and the level line. The slot letter is neutral
 * ink (no hue). When `onFocusRow` is given the letter is a toggle button, "Listen to {slot}", the way
 * a person marks the listening focus; the row itself is not a tab stop.
 *
 * States replace parts, never the identity: Disabled keeps the identity and replaces the well with
 * "Recording unavailable"; Loading draws skeletons with "Loading recording…"; Empty is a dashed slot
 * with a secondary button; Error puts the error primitive in the well area with Retry and Remove.
 * `dimmed` is the crossfader's visual (opacity of the well, set by the deck, with a 120 ms transition
 * that the duration token zeroes under reduced motion).
 *
 * Classes are joined with `clsx`, not `cn`: tailwind-merge 2.x predates Tailwind 4's custom text
 * sizes and would drop one of two `text-*` utilities (see Button.tsx).
 */

export type CompareRowState = 'loading' | 'disabled' | 'empty' | 'error';
export type CompareSlot = 'A' | 'B' | 'C';

export interface CompareRowIdentity {
  siteId: string;
  /** Picks the status mark's shape and colour. */
  status: HabitatStatus;
  /** The dataset's own label text, for example "Healthy (H)". */
  label: string;
  /** The dataset's definition of the label. */
  definition: string;
  /** Who assigned the label (a reference label: the dataset's authors, not the model). */
  assignedBy: string;
  /** Recorder-clock time as `YYYY-MM-DDTHH:MM:SS` (timezone unverified). */
  recordedAt: string;
  /** The manifest's whole-clip RMS in dB re full scale (uncalibrated). */
  rmsDbfs?: number;
  /** The level-matching gain in dB (zero or negative), computed by the deck from the shared target. */
  gainDb?: number;
}

/** Everything a row shows, without callbacks (the deck owns those). */
export interface CompareRowData {
  slot: CompareSlot;
  /** Absent only for an empty slot or a row still loading. */
  identity?: CompareRowIdentity;
  matrix?: SpectrogramMatrix;
  caption?: SpectrogramCaption;
  /** Overrides the metadata-only description the well is given. */
  description?: string;
  state?: CompareRowState;
}

export interface CompareRowProps extends CompareRowData {
  wellRef?: Ref<SpectrogramHandle>;
  /** Static playhead position in seconds (a drawn state); live rows are moved through `wellRef`. */
  playheadSeconds?: number;
  /** Opacity of the well, 0 to 1. */
  dimmed?: number;
  /** This row is the listening focus: a 3 px ink bar on the start edge. */
  isFocus?: boolean;
  /** Makes the slot letter a button; called when it is pressed. */
  onFocusRow?: () => void;
  onScrub?: (seconds: number) => void;
  onAdd?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  /** Draws hover (the identity block's panel-hover) or focus (the slot button's ring) for the fixtures page. */
  forcedState?: 'hover' | 'focus';
  className?: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** "2022-08-30 12:00 on the recorder clock, timezone unverified". */
export function recordedLine(recordedAt: string): string {
  const [date, time = ''] = recordedAt.split('T');
  return `${date} ${time.slice(0, 5)} on the recorder clock, timezone unverified`;
}

/**
 * "Level matched: −60.9 dB RMS, gain 0.0 dB"; the honest fallback when the manifest has no RMS for the
 * clip; nothing when the clip has an RMS but is not part of a match (an unavailable row).
 */
export function levelLine(rmsDbfs: number | undefined, gainDb: number | undefined): string | null {
  if (rmsDbfs === undefined) return 'Level not matched: no RMS level is recorded for this clip.';
  if (gainDb === undefined) return null;
  return `Level matched: ${formatDb(round1(rmsDbfs))} dB RMS, gain ${formatGain(gainDb)} dB`;
}

/** The well's metadata-only description (duration, rate, RMS from the manifest); never about content. */
function describeWell(identity: CompareRowIdentity | undefined, matrix: SpectrogramMatrix | undefined): string {
  if (!matrix) return identity ? `Recording ${identity.siteId}.` : 'No recording.';
  const rate = Number((matrix.sampleRate / 1000).toFixed(3));
  const level = identity?.rmsDbfs === undefined ? '' : `, RMS level ${formatDb(identity.rmsDbfs)} dBFS (from the audio manifest)`;
  return `${Number(matrix.durationSeconds.toFixed(1))} s excerpt at ${rate} kHz${level}.`;
}

/** The site id with a line-break chance after each underscore, so a narrow row wraps at the right place. */
function WrappedId({ id }: { id: string }) {
  const parts = id.split('_');
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <>
              _<wbr />
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

const WELL_BOX = 'h-[160px] sm:h-[200px] lg:h-[230px]';
const FADE = '[&_[data-well]]:transition-opacity [&_[data-well]]:duration-(--duration-fast)';

export function CompareRow({
  slot,
  identity,
  matrix,
  caption,
  description,
  state,
  wellRef,
  playheadSeconds,
  dimmed,
  isFocus = false,
  onFocusRow,
  onScrub,
  onAdd,
  onRetry,
  onRemove,
  forcedState,
  className,
}: CompareRowProps) {
  const forcedHover = forcedState === 'hover' ? { 'data-force-hover': '' } : {};
  const forcedFocus = forcedState === 'focus' ? { 'data-force-focus': '' } : {};

  const letterClass = 'type-display text-[6rem] max-sm:text-[4rem] leading-none text-ink select-none';
  const letter = onFocusRow ? (
    <RacButton
      aria-label={`Listen to ${slot}`}
      aria-pressed={isFocus}
      onPress={onFocusRow}
      {...forcedFocus}
      className={clsx(
        letterClass,
        'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control px-1',
        'hover-state:bg-panel-hover focus-state:focus-ring',
      )}
    >
      {slot}
    </RacButton>
  ) : (
    <span aria-hidden="true" className={clsx(letterClass, 'inline-flex px-1')}>
      {slot}
    </span>
  );

  const frame = (children: ReactNode) => (
    <div
      data-compare-row=""
      data-slot={slot}
      data-listening={isFocus ? 'true' : undefined}
      {...(state ? { 'data-state': state } : {})}
      className={clsx('relative grid items-start gap-x-8 gap-y-4 ps-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]', className)}
    >
      {isFocus ? <span aria-hidden="true" data-listening-bar="" className="absolute inset-y-0 start-0 w-[3px] bg-ink" /> : null}
      {children}
    </div>
  );

  if (state === 'empty') {
    return frame(
      <>
        <div className="flex items-start gap-3">{letter}</div>
        <EmptyState
          title="Add a recording"
          body="Pick a site or a clip to compare."
          action={onAdd ? { label: 'Choose a recording', onPress: onAdd } : undefined}
          className={clsx('flex flex-col justify-center', WELL_BOX)}
        />
      </>,
    );
  }

  if (state === 'loading') {
    return frame(
      <LoadingState label="Loading recording…" className="col-span-full">
        <div className="grid items-start gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="flex items-start gap-3">
            {letter}
            <div className="flex-1 space-y-3 pt-3">
              <Skeleton on="ground" className="h-8 w-40" />
              <Skeleton on="ground" className="h-5 w-32" />
              <Skeleton on="ground" className="h-12 w-full" />
            </div>
          </div>
          <Skeleton on="ground" className={clsx('w-full', WELL_BOX)} />
        </div>
      </LoadingState>,
    );
  }

  const level = identity ? levelLine(identity.rmsDbfs, identity.gainDb) : null;
  const identityBlock = identity ? (
    <div
      data-identity=""
      {...forcedHover}
      className="flex items-start gap-3 rounded-control p-3 hover:bg-panel-hover data-force-hover:bg-panel-hover"
    >
      {letter}
      <div className="min-w-0 flex-1 space-y-3">
        <p className="font-data text-title text-ink">
          <WrappedId id={identity.siteId} />
        </p>
        <RLabel kind="reference">
          <p className="mt-1 flex items-center gap-2 text-body font-semibold text-ink">
            <StatusMark status={identity.status} size={20} />
            <span>{identity.label}</span>
          </p>
          <p className="mt-1 text-small text-muted">{`“${identity.definition}”`}</p>
          <p className="text-small text-muted">{`Assigned by ${identity.assignedBy}`}</p>
        </RLabel>
        <p className="text-small text-muted">{recordedLine(identity.recordedAt)}</p>
        {level ? <p className="text-small text-muted">{level}</p> : null}
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-3 p-3">{letter}</div>
  );

  let well: ReactNode;
  if (state === 'disabled') {
    well = (
      <div data-compare-well-state="disabled" role="status" className={clsx('flex flex-col justify-center bg-well p-4 text-start text-well-ink rounded-surface', WELL_BOX)}>
        <p className="text-small font-semibold">Recording unavailable</p>
        <p className="text-small text-well-muted">This recording cannot be compared right now.</p>
      </div>
    );
  } else if (state === 'error') {
    well = (
      <div data-compare-well-state="error" className={clsx('flex flex-col justify-center gap-4', WELL_BOX)}>
        <ErrorState title="This recording could not be loaded." body="Retry, or remove it from the comparison." headingLevel={3} onRetry={onRetry} />
        {onRemove ? (
          <div>
            <Button variant="secondary" onPress={onRemove}>
              Remove
            </Button>
          </div>
        ) : null}
      </div>
    );
  } else {
    well = (
      <Spectrogram
        ref={wellRef}
        variant="compare"
        source={matrix}
        description={description ?? describeWell(identity, matrix)}
        caption={caption}
        playheadSeconds={playheadSeconds}
        dimmed={dimmed}
        onScrub={onScrub}
        className={FADE}
      />
    );
  }

  return frame(
    <>
      {identityBlock}
      {well}
    </>,
  );
}
