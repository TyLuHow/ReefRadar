'use client';

import { useMemo } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  BandSection,
  SPECTROGRAM_SPEC,
  Spectrogram,
  Waveform,
  formatDb,
  useClipSpectrogram,
  type SpectrogramBand,
  type SpectrogramCaption,
  type SpectrogramProps,
} from '@/features/instrument';
import { attributionLine, getExcerpt } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Spectrogram well (DS-03): the four variants, the playhead, selected window, scroll mode, bands,
 * pointer readout and every state, drawn from the one real committed recording of ind_H1 (a 30 s,
 * 16 kHz MARRS excerpt, CC BY 4.0). The caption fields come from the audio manifest (recorder-clock
 * time, duration, rate) and the dataset name from the contract's own site record; the description is
 * metadata only (duration, rate, RMS level from the manifest). Nothing here is synthetic.
 *
 * While the clip or the contract is loading, or if either fails, the wells show their own loading
 * and error states, so a failure is visible and never replaced by a drawing of something else.
 */

export const SPECTROGRAM_META: FixtureSectionMeta = {
  slug: 'spectrogram',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'Spectrogram',
  contract:
    'A real recording in a dark well with the fixed magma scale, a frequency axis to the Nyquist, time labels and a dB colourbar. The caption prints the parameters used and says the level is uncalibrated. The playhead is a DOM element, and under reduced motion there is no scroll mode.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav through data/audio-manifest.json (url_path, recorded_at_recorder_clock, duration_s, sample_rate_hz, rms_dbfs); dataset_name from contract sites.json (ind_H1) through useReferenceSites; dsp/spec.ts',
};

const EXCERPT = getExcerpt('ind_H1_20220830_120000');
const HOVER_AT = { seconds: 12.4, hz: 3200 };
const PLAYHEAD_AT = 12.4;

function describeClip(): string {
  const rate = Number((EXCERPT.sample_rate_hz / 1000).toFixed(3));
  const level = EXCERPT.rms_dbfs === undefined ? '' : `, RMS level ${formatDb(EXCERPT.rms_dbfs)} dBFS (from the audio manifest)`;
  return `${EXCERPT.duration_s} s excerpt at ${rate} kHz${level}.`;
}

type CellProps = Pick<SpectrogramProps, 'source' | 'description' | 'caption' | 'state'>;

function Cells() {
  const clip = useClipSpectrogram(EXCERPT.url_path);
  const sites = useReferenceSites();
  const dataset = sites.data?.find((site) => site.site_id === EXCERPT.site_id)?.dataset_name;

  const caption = useMemo<SpectrogramCaption | undefined>(
    () =>
      dataset === undefined
        ? undefined
        : {
            siteId: EXCERPT.site_id,
            dataset,
            recordedAt: EXCERPT.recorded_at_recorder_clock,
            durationS: EXCERPT.duration_s,
            sampleRateHz: EXCERPT.sample_rate_hz,
            fftSize: SPECTROGRAM_SPEC.fftSize,
          },
    [dataset],
  );

  const failed = clip.status === 'error' || (sites.error !== null && sites.error !== undefined);
  const waiting = clip.status !== 'ready' || caption === undefined;
  const common: CellProps = {
    source: clip.matrix,
    description: describeClip(),
    caption,
    state: failed ? 'error' : waiting ? 'loading' : undefined,
  };

  const matrix = clip.matrix;
  const bands: SpectrogramBand[] = [];
  if (matrix) {
    const top = matrix.sampleRate / 2;
    for (let i = 0; i < 3; i++) {
      bands.push({ id: `fixture-${i + 1}`, label: `Fixture band ${i + 1}`, lowHz: (top * i) / 3, highHz: (top * (i + 1)) / 3 });
    }
  }

  return (
    <>
      <StateCell primitive="spectrogram" state="panel" span="full" note="Default. Frequency labels at the left, time along the bottom, colourbar at the right (under the well on a phone).">
        <Spectrogram {...common} variant="panel" />
      </StateCell>
      <StateCell primitive="spectrogram" state="hero" span="full" note="Full-bleed on a band; time strip and a horizontal colourbar with end labels under the image.">
        <BandSection as="div" className="py-4">
          <Spectrogram {...common} variant="hero" />
        </BandSection>
      </StateCell>
      <StateCell primitive="spectrogram" state="compare" span="full" note="Chips at the top and bottom only.">
        <Spectrogram {...common} variant="compare" />
      </StateCell>
      <StateCell primitive="spectrogram" state="thumb" note="Height 150, no axes. The caption is read aloud but not drawn.">
        <Spectrogram {...common} variant="thumb" />
      </StateCell>
      <StateCell primitive="spectrogram" state="hover" forced span="full" note="Readout forced at 12.4 s and 3.2 kHz; in use it follows the pointer.">
        <Spectrogram {...common} variant="panel" forcePointer={HOVER_AT} />
      </StateCell>
      <StateCell primitive="spectrogram" state="selected-window" span="full" note="Window 2 (10 s to 15 s) outlined, playhead at 12.4 s.">
        <Spectrogram {...common} variant="panel" selectedWindow={2} playheadSeconds={PLAYHEAD_AT} />
      </StateCell>
      <StateCell
        primitive="spectrogram"
        state="scroll-mode"
        span="full"
        note="Ten seconds visible, the image pans under a playhead held at 22 % (shown at 12.4 s). With reduced motion on, this cell draws as a sweep: there is no scroll mode."
      >
        <Spectrogram {...common} variant="panel" playMode="scroll" visibleSeconds={10} playheadSeconds={PLAYHEAD_AT} />
      </StateCell>
      <StateCell
        primitive="spectrogram"
        state="bands"
        span="full"
        note="Fixture bands split 0 to the recording's top frequency into three equal ranges. The cited band table arrives in a later phase."
      >
        <Spectrogram {...common} variant="panel" bands={bands} />
      </StateCell>
      <StateCell primitive="spectrogram" state="waveform" span="full" note="Min and max envelope of the same recording, on one fixed vertical range.">
        {clip.status === 'ready' && clip.samples && clip.sampleRate ? (
          <Waveform samples={clip.samples} sampleRate={clip.sampleRate} description={describeClip()} />
        ) : (
          <Spectrogram variant="panel" description={describeClip()} state={failed ? 'error' : 'loading'} />
        )}
      </StateCell>
      <StateCell primitive="spectrogram" state="loading">
        <Spectrogram variant="panel" description={describeClip()} state="loading" />
      </StateCell>
      <StateCell primitive="spectrogram" state="empty">
        <Spectrogram variant="panel" description={describeClip()} state="empty" />
      </StateCell>
      <StateCell primitive="spectrogram" state="error">
        <Spectrogram variant="panel" description={describeClip()} state="error" />
      </StateCell>
      <StateCell primitive="spectrogram" state="unsupported" forced>
        <Spectrogram variant="panel" description={describeClip()} state="unsupported" />
      </StateCell>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </>
  );
}

export function SpectrogramSection() {
  return (
    <FixtureSection {...SPECTROGRAM_META}>
      <Cells />
    </FixtureSection>
  );
}
