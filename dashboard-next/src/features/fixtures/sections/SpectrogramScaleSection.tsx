'use client';

import { ColourBar, DB_TICKS, SPECTROGRAM_SPEC, formatDb } from '@/features/instrument';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Spectrogram scale (DS-03): the one colour scale and the one dB range behind every spectrogram, as
 * the ColourBar draws it plus a parameter table. Every value in the table is read from
 * SPECTROGRAM_SPEC and DB_TICKS (src/features/instrument/dsp/spec.ts); none is typed here, so this
 * page cannot drift from what the wells actually use. The scale is documented here and in the
 * ColourBar module header; the manual review item (axe cannot read canvas pixels) is the contrast of
 * labels over the image and the ramp's legibility in greyscale.
 */

export const SPECTROGRAM_SCALE_META: FixtureSectionMeta = {
  slug: 'spectrogram-scale',
  group: 'Foundation',
  kind: 'Scale',
  title: 'Spectrogram scale',
  contract:
    'One magma colour scale and one fixed dB range for every recording, so two wells are comparable by eye and nothing is scaled per clip. Levels are relative to the full scale of the file and are not calibrated sound pressure.',
  data: 'src/features/instrument/dsp/spec.ts (SPECTROGRAM_SPEC, DB_TICKS) and colormap.ts (MAGMA_LUT); no audio',
};

const UNCALIBRATED_CAPTION = 'Level, dB re full scale (uncalibrated; hydrophone sensitivity not applied).';

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The parameter rows, built from the constants. */
function parameterRows(): Array<[string, string]> {
  const { scale, fftSize, hop, window, dbMin, dbMax, reference, calibrated } = SPECTROGRAM_SPEC;
  return [
    ['Scale', `${scale}, 256-step lookup table (matplotlib, CC0; Nathaniel J. Smith and Stefan van der Walt)`],
    [
      'Range',
      `${formatDb(dbMin)} to ${formatDb(dbMax)} dB re ${reference}, ${calibrated ? 'calibrated' : 'uncalibrated'}, shared by every well`,
    ],
    ['Window', `${fftSize}-point ${titleCase(window)}`],
    ['Hop', `${hop} samples`],
    ['Axis', 'linear, 0 to Nyquist'],
    ['Ticks', `${DB_TICKS.map((tick) => formatDb(tick)).join(', ')} dB`],
  ];
}

export function SpectrogramScaleSection() {
  return (
    <FixtureSection {...SPECTROGRAM_SCALE_META}>
      <StateCell primitive="spectrogram-scale" state="vertical" note="Dark is quiet and bright is loud. The vertical bar sits at the right of a panel well.">
        <div className="h-[220px]">
          <ColourBar orientation="vertical" labels="all" tone="surface" length={220} />
        </div>
        <p className="mt-3 text-small text-muted">{UNCALIBRATED_CAPTION}</p>
      </StateCell>
      <StateCell primitive="spectrogram-scale" state="horizontal" note="The horizontal bar sits under a hero well, and under every well on a phone.">
        <ColourBar orientation="horizontal" labels="all" tone="surface" length={320} caption={UNCALIBRATED_CAPTION} />
      </StateCell>
      <StateCell primitive="spectrogram-scale" state="parameters" span="full">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
          {parameterRows().map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="type-eyebrow text-muted">{term.toUpperCase()}</dt>
              <dd className="text-small text-ink [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </StateCell>
    </FixtureSection>
  );
}
