'use client';

import clsx from 'clsx';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, useReducedMotion } from '@/features/ui';
import { ColourBar, formatDb } from './ColourBar';
import { CompareRow, type CompareRowData, type CompareSlot } from './CompareRow';
import { Crossfader } from './Crossfader';
import { SPECTROGRAM_SPEC } from './dsp';
import { durationsMatch, levelMatchGains, specsMatch, wellOpacity } from './compare-math';
import type { SpectrogramHandle } from './Spectrogram';
import { Transport, type TransportDisplayStatus } from './Transport';
import { UnequalLengthError } from './audio-engine';
import { useTransport, type TransportClip } from './useTransport';

/**
 * CompareDeck (DS-05, DS-06, UI-SPEC "CompareRow and CompareDeck"): two real recordings, A and B
 * (and C, shown but not played), on ONE colour scale, with one shared playhead and one A/B crossfader.
 *
 * Fair comparison, enforced here and not left to the caller (T-04-16-01, T-04-16-02):
 * - One scale. The wells share the fixed range of the spectrogram spec only when every matrix was
 *   computed with the same analysis settings (`specsMatch`). When they differ the deck shows
 *   "These recordings use different analysis settings, so they cannot share one colour scale." and
 *   draws no wells: it never rescales either one.
 * - One length. Clips play together only when they are the same length (`durationsMatch`); nothing is
 *   stretched. The audio engine refuses unequal clips as well (UnequalLengthError).
 * - Matched playback level, attenuation only. Gains come from the manifest RMS (`levelMatchGains`,
 *   target = the quietest clip), so no clip is ever played louder than its original. Each row prints
 *   "Level matched: {rms} dB RMS, gain {gain} dB" and the deck discloses that original levels differ.
 *   A clip with no RMS in the manifest is not matched, and the deck says so.
 * - No auto-gain, no per-clip colour scaling, no model output: only labels the dataset assigned.
 *
 * Audio is `useTransport` over the two clips: one AudioContext, both sources started on the same
 * frame, `setMix` with equal-power gains (cos and sin) multiplied by the level-matching gain, and one
 * playhead clock that writes both wells through their handles (no per-frame React state). The
 * crossfader is also the dim of the well the mix moves away from: continuity motion, a switch at the
 * 50% point with no ramp under reduced motion. The slot letter is the "listening focus": pressing
 * "Listen to B" moves the mix to B alone, marks B with the ink bar and announces "Listening to B";
 * moving the crossfader afterwards clears the mark, because the mix no longer says "B alone".
 */

export interface CompareDeckProps {
  /** Two or three rows, in slot order. Rows A and B must both be playable for the audio to be enabled. */
  rows: CompareRowData[];
  /** The clips' bytes for the audio engine, matched by `id === row.identity.siteId`. */
  clips: TransportClip[];
  onAdd?: (slot: CompareSlot) => void;
  onRetry?: (slot: CompareSlot) => void;
  onRemove?: (slot: CompareSlot) => void;
  /** Initial crossfader position in [0, 1]. Default 0.5. */
  defaultMix?: number;
  /** Initial listening focus. Absent means none. */
  defaultListening?: 'A' | 'B';
  /** Fixtures page only: draw hover or focus on every row. */
  forcedRowState?: 'hover' | 'focus';
  /** Fixtures page only: draw the deck as playing at this position; the transport then does nothing. */
  forcedPlaying?: { positionS: number };
  className?: string;
}

const DIFFERENT_SCALES = 'These recordings use different analysis settings, so they cannot share one colour scale.';
const DIFFERENT_LENGTHS = 'These recordings are different lengths, so they cannot be played together. Nothing is stretched to fit.';
const DISCLOSURE =
  'Playback levels are matched to the same RMS level so clips can be compared at similar volume. Original recording levels differ and are not shown by loudness.';
const DISCLOSURE_UNMATCHED =
  'Playback levels are not matched, because a recording has no RMS level in the manifest. Original recording levels differ and are not shown by loudness.';
const NOTICE = 'border-s-[3px] border-ink ps-3 text-small font-semibold text-ink';

const isNumber = (value: number | undefined): value is number => typeof value === 'number';

export function CompareDeck({
  rows,
  clips,
  onAdd,
  onRetry,
  onRemove,
  defaultMix = 0.5,
  defaultListening,
  forcedRowState,
  forcedPlaying,
  className,
}: CompareDeckProps) {
  const containerRef = useRef<HTMLElement>(null);
  const refA = useRef<SpectrogramHandle>(null);
  const refB = useRef<SpectrogramHandle>(null);
  const refC = useRef<SpectrogramHandle>(null);
  const wellRefs = useMemo(() => ({ A: refA, B: refB, C: refC }), []);
  const reduced = useReducedMotion(containerRef);

  const [mix, setMix] = useState(defaultMix);
  const [listening, setListening] = useState<'A' | 'B' | null>(defaultListening ?? null);

  // The playable pair: slots A and B, both ready and with their bytes. Otherwise the audio stays off.
  const playable = useMemo(() => {
    const pick = (slot: 'A' | 'B') => {
      const row = rows.find((candidate) => candidate.slot === slot);
      if (!row || row.state || !row.matrix || !row.identity) return null;
      const clip = clips.find((candidate) => candidate.id === row.identity?.siteId);
      return clip ? { row, clip } : null;
    };
    const a = pick('A');
    const b = pick('B');
    return a && b ? [a, b] : [];
  }, [rows, clips]);

  // Level matching from the manifest RMS, only when every playable clip has one.
  const gainsDb = useMemo(() => {
    const rms = playable.map((entry) => entry.row.identity?.rmsDbfs);
    return rms.length > 0 && rms.every(isNumber) ? levelMatchGains(rms) : undefined;
  }, [playable]);
  const gainKey = gainsDb ? gainsDb.join(',') : '';
  const gainBySite = useMemo(() => {
    const map = new Map<string, number>();
    if (gainsDb) playable.forEach((entry, index) => map.set(entry.row.identity?.siteId ?? '', gainsDb[index]));
    return map;
  }, [gainsDb, playable]);

  const matrices = rows.flatMap((row) => (row.matrix && !row.state ? [row.matrix] : []));
  const sameScale = matrices.every((matrix) => specsMatch(matrices[0], matrix));
  const sameLength = durationsMatch(playable.map((entry) => entry.row.matrix?.durationSeconds ?? 0));
  const ready = sameScale && sameLength && playable.length === 2;

  // useTransport keeps the previous clips while the content (ids, bytes, durations) is the same, so a fresh array is fine.
  const transportClips = ready ? playable.map((entry) => entry.clip) : [];
  const wells = useMemo(() => rows.map((row) => wellRefs[row.slot]), [rows, wellRefs]);
  const transport = useTransport({ clips: transportClips, wells, observe: containerRef, levelGainsDb: gainsDb });
  const applyMix = transport.setMix;

  // Re-apply the crossfader whenever the engine, the clips or the matched levels change: a new engine starts at A alone.
  useEffect(() => {
    applyMix(mix);
  }, [applyMix, mix, gainKey]);

  const anyLoading = rows.some((row) => row.state === 'loading');
  const liveStatus: TransportDisplayStatus = ready ? transport.status : anyLoading ? 'loading' : 'disabled';
  const status: TransportDisplayStatus = forcedPlaying ? 'playing' : liveStatus;
  const position = forcedPlaying ? forcedPlaying.positionS : transport.positionS;
  const duration = (ready ? transport.durationS : 0) || matrices[0]?.durationSeconds || 0;

  const noop = () => undefined;
  const controls = forcedPlaying
    ? { onPlayPause: noop, onStep: noop, onSeek: noop, onScrub: undefined }
    : { onPlayPause: transport.playPause, onStep: transport.step, onSeek: transport.seek, onScrub: transport.seek };

  function chooseListening(slot: 'A' | 'B') {
    setListening(slot);
    setMix(slot === 'A' ? 0 : 1);
  }

  const dbMin = matrices[0]?.dbMin ?? SPECTROGRAM_SPEC.dbMin;
  const dbMax = matrices[0]?.dbMax ?? SPECTROGRAM_SPEC.dbMax;
  const scaleCaption = `One colour scale for ${rows.length === 2 ? 'both' : 'all'} wells: ${formatDb(dbMin)} to ${formatDb(dbMax)} dB re full scale, uncalibrated.`;
  const lengthNotice = (sameScale && !sameLength) || transport.error instanceof UnequalLengthError;

  return (
    <section
      ref={containerRef}
      data-compare-deck=""
      data-scale={sameScale ? 'shared' : 'different'}
      aria-label="Compare recordings"
      className={clsx('flex flex-col gap-6', className)}
    >
      {sameScale ? (
        <>
          {rows.map((row, index) => {
            const gainDb = gainBySite.get(row.identity?.siteId ?? '');
            const identity = row.identity && gainDb !== undefined ? { ...row.identity, gainDb } : row.identity;
            return (
              <Fragment key={row.slot}>
                <CompareRow
                  {...row}
                  identity={identity}
                  wellRef={wellRefs[row.slot]}
                  playheadSeconds={forcedPlaying?.positionS}
                  dimmed={row.slot === 'A' ? wellOpacity(mix, 'a', reduced) : row.slot === 'B' ? wellOpacity(mix, 'b', reduced) : undefined}
                  isFocus={listening === row.slot}
                  onFocusRow={row.slot === 'C' || !ready || forcedPlaying ? undefined : () => chooseListening(row.slot as 'A' | 'B')}
                  onScrub={controls.onScrub}
                  forcedState={forcedRowState}
                  onAdd={onAdd ? () => onAdd(row.slot) : undefined}
                  onRetry={onRetry ? () => onRetry(row.slot) : undefined}
                  onRemove={onRemove ? () => onRemove(row.slot) : undefined}
                />
                {index === 0 ? (
                  <div data-compare-strip="" className="flex flex-wrap items-center gap-x-8 gap-y-4 bg-panel p-5">
                    <Transport
                      size="medium"
                      medium="compare"
                      status={status}
                      position={position}
                      duration={duration}
                      onPlayPause={controls.onPlayPause}
                      onStep={controls.onStep}
                      onSeek={controls.onSeek}
                      onRetry={controls.onPlayPause}
                      playLabel="Play both"
                      pauseLabel="Pause both"
                    />
                    <Crossfader
                      value={mix}
                      onChange={(next) => {
                        setMix(next);
                        setListening(null);
                      }}
                      isDisabled={!ready && !forcedPlaying}
                      className="min-w-64 flex-1"
                    />
                    <ColourBar orientation="horizontal" length={140} labels="ends" tone="surface" />
                  </div>
                ) : null}
              </Fragment>
            );
          })}
          <p data-scale-caption="" className="text-small text-muted">
            {scaleCaption}
          </p>
          {rows.length > 2 ? (
            <p className="text-small text-muted">The crossfader mixes A and B. The other recording is shown on the same scale and playhead but is not played.</p>
          ) : null}
          {lengthNotice ? (
            <p role="status" data-notice="lengths" className={NOTICE}>
              {DIFFERENT_LENGTHS}
            </p>
          ) : null}
          <p data-disclosure="" className="text-small text-muted">
            {gainsDb !== undefined || playable.length === 0 ? DISCLOSURE : DISCLOSURE_UNMATCHED}
          </p>
        </>
      ) : (
        <div data-notice="scales" role="status">
          <EmptyState title={DIFFERENT_SCALES} body="Neither recording has been rescaled to match the other." />
        </div>
      )}
      <p data-live-region="listening" role="status" className="sr-only">
        {listening ? `Listening to ${listening}` : ''}
      </p>
    </section>
  );
}
