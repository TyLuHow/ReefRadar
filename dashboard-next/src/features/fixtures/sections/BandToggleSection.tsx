'use client';

import { useState, type ReactNode } from 'react';
import { BandToggle, type BandDefinition, type BandToggleProps } from '@/features/instrument';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { FIXTURE_EXCERPT } from '../parts/useFixtureClip';

/**
 * BandToggle (DS-05): the multiple-selection band control on the real recording's frequency range.
 * The three bands are an equal three-way split of 0 to the Nyquist frequency of ind_H1, labelled as
 * fixture bands: the cited band table and its names arrive in Phase 7, and no band carries a
 * species, behaviour or guild name. In this fixture the selection filters no audio (the audio
 * engine has no band filter yet), and the section says so.
 *
 * No real band lies above an 8 kHz Nyquist, so the DISABLED cell is a forced state with its own
 * note; the computed rule and its UI-SPEC wording ("Above this recording's {n} kHz limit.") are
 * unit-tested with test inputs (tests/unit/band-toggle.test.tsx).
 */

export const BAND_TOGGLE_META: FixtureSectionMeta = {
  slug: 'band-toggle',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'BandToggle',
  contract:
    'A multiple-selection group of frequency bands, each showing its label and range. A band above the recording\'s top frequency is disabled with its reason, and at least one band always stays on so playback is never silent.',
  data: 'data/audio-manifest.json: sample_rate_hz of ind_H1_20220830_120000 (Nyquist 8 kHz, bands split into three equal ranges); states are forced with data-force-* attributes, forceDisabled and state',
};

const NYQUIST_HZ = FIXTURE_EXCERPT.sample_rate_hz / 2;

/** Low, Mid and High: three equal ranges from 0 to the recording's top frequency. */
const BANDS: BandDefinition[] = ['Low', 'Mid', 'High'].map((label, index) => ({
  id: label.toLowerCase(),
  label,
  lowHz: (NYQUIST_HZ * index) / 3,
  highHz: (NYQUIST_HZ * (index + 1)) / 3,
}));

const FIXTURE_NOTE = "Fixture bands split 0 to the recording's top frequency into three equal ranges. The cited band table arrives in a later phase.";
const NO_FILTER_NOTE = 'In this fixture the selection does not filter any audio.';
const DISABLED_REASON = `Disabled for review: no fixture band lies above this recording's ${NYQUIST_HZ / 1000} kHz limit.`;

type Rest = Partial<Omit<BandToggleProps, 'bands' | 'nyquistHz' | 'selectedKeys' | 'onSelectionChange'>>;

/** A BandToggle that keeps its own selection, so every cell can be pressed. */
function Live({ initial, ...rest }: { initial: string[] } & Rest) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  return <BandToggle bands={BANDS} nyquistHz={NYQUIST_HZ} selectedKeys={selected} onSelectionChange={setSelected} {...rest} />;
}

function Well({ children }: { children: ReactNode }) {
  return <div className="rounded-surface bg-well p-4">{children}</div>;
}

export function BandToggleSection() {
  return (
    <FixtureSection {...BAND_TOGGLE_META}>
      <p className="col-span-full text-small text-muted">{`${FIXTURE_NOTE} ${NO_FILTER_NOTE}`}</p>
      <StateCell primitive="band-toggle" state="default" note="Low and Mid on, High off.">
        <Live initial={['low', 'mid']} />
      </StateCell>
      <StateCell primitive="band-toggle" state="hover" forced>
        <Live initial={['low', 'mid']} forced={{ id: 'high', state: 'hover' }} />
      </StateCell>
      <StateCell primitive="band-toggle" state="pressed" forced>
        <Live initial={['low', 'mid']} forced={{ id: 'high', state: 'pressed' }} />
      </StateCell>
      <StateCell primitive="band-toggle" state="focus" forced>
        <Live initial={['low', 'mid']} forced={{ id: 'high', state: 'focus' }} />
      </StateCell>
      <StateCell primitive="band-toggle" state="selected" note="One band on: it cannot be turned off, so playback is never silent.">
        <Live initial={['mid']} />
      </StateCell>
      <StateCell primitive="band-toggle" state="disabled" forced note={DISABLED_REASON}>
        <Live initial={['low', 'mid']} forceDisabled={{ id: 'high', reason: DISABLED_REASON }} />
      </StateCell>
      <StateCell primitive="band-toggle" state="loading">
        <Live initial={[]} state="loading" />
      </StateCell>
      <StateCell primitive="band-toggle" state="empty">
        <Live initial={[]} state="empty" />
      </StateCell>
      <StateCell primitive="band-toggle" state="error">
        <Live initial={[]} state="error" />
      </StateCell>
      <StateCell primitive="band-toggle" state="well-tone" note="The same control inside a well or band.">
        <Well>
          <Live initial={['low', 'mid']} tone="well" />
        </Well>
      </StateCell>
    </FixtureSection>
  );
}
