'use client';

import clsx from 'clsx';
import { Pause, Play } from 'lucide-react';
import { useId, type Ref } from 'react';
import { Link as RacLink } from 'react-aria-components';
import { Button, ErrorState, LoadingState, Skeleton, StatusMark, type HabitatStatus } from '@/features/ui';
import { RLabel, type RLabelKind } from './RLabel';
import { Spectrogram, type SpectrogramCaption, type SpectrogramHandle } from './Spectrogram';
import type { SpectrogramMatrix } from './dsp';

/**
 * ClipCard (DS-05, UI-SPEC "ClipCard", A15): a thumbnail spectrogram of one real recording, a play
 * button, the site id, the status mark with its label, and "{place} · {recorded date}".
 *
 * The card is not a link. The site id is a link to the site page only when `href` is given. The play
 * button is a `medium` (56 px) transport button named "Play {siteId}" (and "Pause {siteId}" while
 * playing); the card does no audio itself, the caller owns playback and reports presses with `onPlay`.
 * Nothing starts without a press.
 *
 * The status mark and label sit inside an R-LABEL: by default a solid-rule "REFERENCE LABEL" (the
 * dataset's authors assigned it), with `assignedBy` naming who; `labelKind="model"` draws the dashed
 * "MODEL READING" rule instead. A card never shows an unmarked label.
 *
 * States: default, hover (`panel-hover` behind the text only), focus (the control's ring), playing
 * (the label flips to Pause), loading (skeletons and "Loading recording…") and error ("This
 * recording could not be loaded."). Empty does not apply: a card always names a recording.
 * Classes are joined with `clsx`, not `cn` (see Button.tsx).
 */

export type ClipCardState = 'loading' | 'error';

export interface ClipCardProps {
  siteId: string;
  status: HabitatStatus;
  /** The label text beside the status mark (the dataset's own label or the status name). */
  statusLabel: string;
  /** Who assigned the label, for a reference label (for example the dataset's authors). */
  assignedBy?: string;
  labelKind?: RLabelKind;
  /** "Mombasa Coast, Kenya": where the recording was made. */
  place: string;
  /** `YYYY-MM-DD`, recorder clock. */
  recordedDate: string;
  matrix?: SpectrogramMatrix;
  /** Plain-text description of the thumbnail: metadata only. Defaults to a line naming the site, place and date. */
  description?: string;
  caption?: SpectrogramCaption;
  /** Makes the site id a link to the site page. */
  href?: string;
  isPlaying?: boolean;
  onPlay: () => void;
  onRetry?: () => void;
  /** For the thumbnail's playhead (the caller's `useTransport` writes it); optional. */
  wellRef?: Ref<SpectrogramHandle>;
  state?: ClipCardState;
  /** Fixtures page only: draw hover (behind the text) or focus (on the play button). */
  forcedState?: 'hover' | 'focus';
  className?: string;
}

const PLAY_BUTTON = clsx(
  'size-14! bg-control! text-on-control! hover-state:bg-control-hover! pressed-state:bg-control-pressed!',
  'data-disabled:bg-track!',
);

/** "{place} · {recorded date}". */
export function clipCardPlaceLine(place: string, recordedDate: string): string {
  return `${place} · ${recordedDate}`;
}

export function ClipCard({
  siteId,
  status,
  statusLabel,
  assignedBy,
  labelKind = 'reference',
  place,
  recordedDate,
  matrix,
  description,
  caption,
  href,
  isPlaying = false,
  onPlay,
  onRetry,
  wellRef,
  state,
  forcedState,
  className,
}: ClipCardProps) {
  const idId = useId();
  const forcedHover = forcedState === 'hover' ? { 'data-force-hover': '' } : {};
  const forcedFocus = forcedState === 'focus' ? { 'data-force-focus': '' } : {};

  if (state === 'loading') {
    return (
      <article data-clip-card="" data-state="loading" aria-label={`Recording ${siteId}`} className={clsx('flex flex-col gap-3', className)}>
        <LoadingState label="Loading recording…">
          <Skeleton on="ground" className="h-[150px] w-full" />
          <div className="mt-3 flex items-start gap-4">
            <Skeleton on="ground" className="size-14 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton on="ground" className="h-6 w-32" />
              <Skeleton on="ground" className="h-5 w-40" />
              <Skeleton on="ground" className="h-4 w-48" />
            </div>
          </div>
        </LoadingState>
      </article>
    );
  }

  const idText = (
    <span id={idId} className="font-data text-lead text-ink [overflow-wrap:anywhere]">
      {siteId}
    </span>
  );

  return (
    <article data-clip-card="" data-playing={isPlaying ? 'true' : undefined} aria-labelledby={idId} className={clsx('flex flex-col gap-3', className)}>
      {state === 'error' ? (
        <div data-clip-card-error="" className="flex h-[150px] flex-col justify-center">
          <ErrorState title="This recording could not be loaded." body="Retry, or choose another recording." headingLevel={3} onRetry={onRetry} />
        </div>
      ) : (
        <Spectrogram
          ref={wellRef}
          variant="thumb"
          source={matrix}
          state={matrix ? undefined : 'loading'}
          description={description ?? `Recording ${siteId}, ${place}, recorded ${recordedDate}.`}
          caption={caption}
        />
      )}
      <div className="flex items-start gap-4">
        {state === 'error' ? null : (
          <Button
            variant="icon"
            aria-label={isPlaying ? `Pause ${siteId}` : `Play ${siteId}`}
            onPress={onPlay}
            className={PLAY_BUTTON}
            {...forcedFocus}
          >
            {isPlaying ? (
              <Pause aria-hidden="true" className="size-[34%] shrink-0" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play aria-hidden="true" className="size-[34%] shrink-0" fill="currentColor" strokeWidth={0} />
            )}
          </Button>
        )}
        <div
          data-clip-card-text=""
          {...forcedHover}
          className="min-w-0 flex-1 space-y-2 rounded-control p-2 hover:bg-panel-hover data-force-hover:bg-panel-hover"
        >
          {href ? (
            <RacLink
              href={href}
              className="inline-flex min-h-11 items-center rounded-control hover-state:underline focus-state:focus-ring"
            >
              {idText}
            </RacLink>
          ) : (
            <p>{idText}</p>
          )}
          <RLabel kind={labelKind}>
            <p className="mt-1 flex items-center gap-2 text-body font-semibold text-ink">
              <StatusMark status={status} size={16} />
              <span>{statusLabel}</span>
            </p>
            {assignedBy ? <p className="text-small text-muted">{`Assigned by ${assignedBy}`}</p> : null}
          </RLabel>
          <p className="text-small text-muted">{clipCardPlaceLine(place, recordedDate)}</p>
        </div>
      </div>
    </article>
  );
}
