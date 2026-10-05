import clsx from 'clsx';
import { DB_TICKS, SPECTROGRAM_SPEC, lutColor } from './dsp';

/**
 * ColourBar (DS-03, 04-13): the dB legend of the spectrogram scale, a 12 px strip filled from the
 * same 256-step magma lookup table that paints the wells, with the tick values from DB_TICKS.
 *
 * The scale, printed once here and on /dev/fixtures/spectrogram-scale:
 * - colours: magma, 256 steps, matplotlib's perceptually uniform map (CC0, Nathaniel J. Smith and
 *   Stefan van der Walt), identical in every direction; the dark end is quiet, the bright end loud;
 * - range: one fixed -120 to -50 dB re full scale of the file for every clip, never scaled per clip;
 * - uncalibrated: the recorders' hydrophone sensitivity is not applied, so the numbers are levels
 *   relative to the file's full scale, not sound pressure levels.
 *
 * Manual review item (axe cannot measure canvas pixels): the contrast of labels drawn over the
 * magma image and the legibility of the ramp in greyscale are judged by eye in the fixtures review;
 * the chips that sit over the image carry their own opaque background so their text never depends
 * on the pixels beneath.
 */

export interface ColourBarProps {
  orientation: 'vertical' | 'horizontal';
  /** Length of the strip in CSS pixels, or `fill` for the whole parent. Vertical default: fill the parent height. Horizontal default: 220. */
  length?: number | 'fill';
  /** `all` prints every DB_TICKS value; `ends` prints the lowest and highest only. */
  labels: 'all' | 'ends';
  /** A line under the bar (for example the uncalibrated note). */
  caption?: string;
  /** The surface the bar sits on: inside a well (default), on the page, or on a band. */
  tone?: 'well' | 'surface' | 'band';
  className?: string;
}

const MINUS = '−';
const STRIP_THICKNESS = 12;
const HORIZONTAL_LENGTH = 220;
const STOPS = 16;

/** A dB value with a U+2212 minus sign for negatives (never a hyphen). */
export function formatDb(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? MINUS : ''}${Math.abs(rounded)}`;
}

/** Position of a level on the fixed range, 0 (dbMin) to 100 (dbMax), in percent. */
function levelPercent(db: number): number {
  return ((db - SPECTROGRAM_SPEC.dbMin) / (SPECTROGRAM_SPEC.dbMax - SPECTROGRAM_SPEC.dbMin)) * 100;
}

/** The magma ramp as a CSS gradient from the lookup table, dark (dbMin) at the start. */
function gradient(direction: 'to top' | 'to right'): string {
  const stops: string[] = [];
  for (let i = 0; i < STOPS; i++) {
    const level = (255 * i) / (STOPS - 1);
    stops.push(`${lutColor(level)} ${(100 * i) / (STOPS - 1)}%`);
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

const GRADIENT = { vertical: gradient('to top'), horizontal: gradient('to right') } as const;

const TICK_TEXT = {
  well: 'text-well-muted',
  surface: 'text-muted',
  band: 'text-on-band-muted',
} as const;

const ACCESSIBLE_NAME = `Colour scale, ${MINUS}${Math.abs(SPECTROGRAM_SPEC.dbMin)} to ${MINUS}${Math.abs(SPECTROGRAM_SPEC.dbMax)} dB re full scale, uncalibrated`;

export function ColourBar({ orientation, length, labels, caption, tone = 'well', className }: ColourBarProps) {
  const vertical = orientation === 'vertical';
  const ticks = labels === 'all' ? DB_TICKS : [DB_TICKS[0], DB_TICKS[DB_TICKS.length - 1]];
  const text = TICK_TEXT[tone];
  const size = length === 'fill' ? undefined : vertical ? length : (length ?? HORIZONTAL_LENGTH);

  return (
    <div
      data-colourbar=""
      data-orientation={orientation}
      data-labels={labels}
      className={clsx(vertical ? 'flex h-full flex-col' : 'flex max-w-full flex-col', className)}
      style={vertical ? { height: size === undefined ? undefined : `${size}px` } : { width: size === undefined ? '100%' : `${size}px` }}
    >
      <div role="img" aria-label={ACCESSIBLE_NAME} className={clsx(vertical ? 'flex min-h-0 flex-1 flex-row' : 'flex flex-col')}>
        <div
          data-strip=""
          className={clsx('shrink-0 border border-well-rule', vertical ? 'h-full' : 'w-full')}
          style={{
            backgroundImage: GRADIENT[orientation],
            ...(vertical ? { width: `${STRIP_THICKNESS}px` } : { height: `${STRIP_THICKNESS}px` }),
          }}
        />
        <div className={clsx('relative', vertical ? 'ms-1 h-full w-9' : 'mt-1 h-4 w-full')}>
          {ticks.map((db, index) => {
            const percent = levelPercent(db);
            const last = index === ticks.length - 1;
            const edgeShift = vertical ? (percent === 0 ? '0%' : percent === 100 ? '-100%' : '-50%') : index === 0 ? '0%' : last ? '-100%' : '-50%';
            return (
              <span
                key={db}
                data-tick=""
                className={clsx('absolute whitespace-nowrap font-data text-eyebrow leading-none', text)}
                style={
                  vertical
                    ? { bottom: `${percent}%`, left: 0, transform: `translateY(${percent === 0 ? '0%' : percent === 100 ? '100%' : '50%'})` }
                    : { left: `${percent}%`, top: 0, transform: `translateX(${edgeShift})` }
                }
              >
                {formatDb(db)}
              </span>
            );
          })}
        </div>
      </div>
      {caption ? <p className={clsx('mt-1 text-eyebrow', text)}>{caption}</p> : null}
    </div>
  );
}
