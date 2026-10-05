import { projectionCaveat } from '@/features/charts';
import { STATUS_LABELS, type HabitatStatus } from '@/features/ui';

/**
 * The headline and sub-line copy of the Compare and Explore compositions (04-21, UI-SPEC
 * "Expressive Compositions", Headline copy). Each sentence is a template over values the caller
 * computed (a status from the contract, a distance from `haversineKm`, a count from the sites, a
 * share from the projection, a time from the audio manifest). Nothing is typed that data could say,
 * and the words follow the copy rules: "reading" for model output, "reference label" for a dataset's
 * label, recorder-clock times, no claim about health.
 */

/** "2022-08-30" and "12:00" from a recorder-clock timestamp such as "2022-08-30T12:00:00". */
export function splitRecordedAt(recordedAt: string): { date: string; time: string } {
  const [date, time = ''] = recordedAt.split('T');
  return { date, time: time.slice(0, 5) };
}

/** "Healthy and degraded, 0.8 km apart." (the distance to one decimal). */
export function compareHeadline(a: HabitatStatus, b: HabitatStatus, km: number): string {
  return `${STATUS_LABELS[a]} and ${STATUS_LABELS[b].toLowerCase()}, ${km.toFixed(1)} km apart.`;
}

const SCALE_SENTENCE = 'One colour scale for both, so brighter means louder in either.';

/**
 * The line under the Compare headline. Two recordings made at the same recorder-clock date and time
 * read "Both recorded {date} at {time} on the recorder clock."; otherwise each is dated on its own.
 */
export function compareSubline(recordedA: string, recordedB: string): string {
  const a = splitRecordedAt(recordedA);
  const b = splitRecordedAt(recordedB);
  const when =
    a.date === b.date && a.time === b.time
      ? `Both recorded ${a.date} at ${a.time} on the recorder clock.`
      : `Recorded ${a.date} ${a.time} and ${b.date} ${b.time} on the recorder clock.`;
  return `${when} ${SCALE_SENTENCE}`;
}

/** "A partial map of 45 reef soundscapes." for the sites that have projection coordinates. */
export function exploreHeadline(plotted: number): string {
  return `A partial map of ${plotted} reef ${plotted === 1 ? 'soundscape' : 'soundscapes'}.`;
}

/** The line under the Explore headline; the share of variation is computed from the projection, not typed. */
export function exploreSubline(cumulativeExplained: number): string {
  return `Each mark is one site, placed by the two strongest patterns in its sound embedding. ${projectionCaveat(cumulativeExplained)} Select a site to hear it.`;
}
