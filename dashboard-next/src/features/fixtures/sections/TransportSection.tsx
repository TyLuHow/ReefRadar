'use client';

import { useRef } from 'react';
import {
  BandSection,
  Spectrogram,
  Transport,
  useTransport,
  type SpectrogramHandle,
  type TransportDisplayStatus,
  type TransportProps,
} from '@/features/instrument';
import { attributionLine } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { FIXTURE_EXCERPT, useFixtureClip } from '../parts/useFixtureClip';

/**
 * Transport (DS-05, DS-06): the live cell plays the real committed ind_H1 excerpt (30 s, 16 kHz,
 * MARRS, CC BY 4.0) through the 04-14 audio engine and moves the panel well's playhead; every other
 * cell is a static state drawn from the same recording's real duration. Nothing plays until a press
 * or a key. The static cells' buttons do nothing (they are drawn for review), and the forced cells
 * say so.
 */

export const TRANSPORT_META: FixtureSectionMeta = {
  slug: 'transport',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'Transport',
  contract:
    'Previous window, play or pause, next window and a time readout, in compact, medium and large sizes of one component. Playback starts only from a press or a key. Space plays or pauses, the arrow keys move one 5 s window, Home and End jump to the ends.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav through data/audio-manifest.json (url_path, duration_s, recorded_at_recorder_clock, sample_rate_hz, rms_dbfs); dataset_name from contract sites.json (ind_H1) through useReferenceSites; states are forced with data-force-* attributes',
};

const noop = () => undefined;
/** The excerpt's own duration from the audio manifest, not a typed value. */
const DURATION_S = FIXTURE_EXCERPT.duration_s;
const PLAYING_AT = 12.4;

type StaticProps = Pick<TransportProps, 'tone' | 'medium' | 'showScrub' | 'showHint' | 'forcedState'> & {
  status: TransportDisplayStatus;
  position?: number;
};

/** A drawn state of the Transport over the real duration; its handlers do nothing. */
function Static({ status, position = 0, size = 'compact', ...rest }: StaticProps & { size?: TransportProps['size'] }) {
  return (
    <Transport
      size={size}
      status={status}
      position={position}
      duration={DURATION_S}
      onPlayPause={noop}
      onStep={noop}
      onSeek={noop}
      onRetry={status === 'error' ? noop : undefined}
      {...rest}
    />
  );
}

function LiveCell() {
  const fixture = useFixtureClip();
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const transport = useTransport({ clips: fixture.transportClips, wells: [wellRef], observe: observeRef });

  const status: TransportDisplayStatus = fixture.failed ? 'error' : fixture.waiting ? 'loading' : transport.status;

  return (
    <div ref={observeRef} className="flex flex-col gap-4">
      <Spectrogram
        ref={wellRef}
        variant="panel"
        source={fixture.clip.matrix}
        description={fixture.description}
        caption={fixture.caption}
        state={fixture.wellState}
        onScrub={transport.seek}
      />
      <Transport
        size="compact"
        status={status}
        position={transport.positionS}
        duration={transport.durationS || DURATION_S}
        onPlayPause={transport.playPause}
        onStep={transport.step}
        onSeek={transport.seek}
        onRetry={() => window.location.reload()}
        playLabel="Play"
        showScrub
        showHint
      />
      {transport.status === 'error' && transport.error ? <p className="text-small text-muted">{transport.error.message}</p> : null}
    </div>
  );
}

export function TransportSection() {
  return (
    <FixtureSection {...TRANSPORT_META}>
      <StateCell
        primitive="transport"
        state="live"
        span="full"
        note="The real recording. Press Play, or focus the controls and press Space. The playhead moves over the well and the readout follows once a second."
      >
        <LiveCell />
      </StateCell>
      <StateCell primitive="transport" state="default">
        <Static status="idle" showHint />
      </StateCell>
      <StateCell primitive="transport" state="playing" forced note={`Position forced at ${PLAYING_AT} s of ${DURATION_S.toFixed(1)} s.`}>
        <Static status="playing" position={PLAYING_AT} />
      </StateCell>
      <StateCell primitive="transport" state="ended">
        <Static status="ended" position={DURATION_S} />
      </StateCell>
      <StateCell primitive="transport" state="hover" forced>
        <Static status="idle" forcedState="hover" />
      </StateCell>
      <StateCell primitive="transport" state="pressed" forced>
        <Static status="idle" forcedState="pressed" />
      </StateCell>
      <StateCell primitive="transport" state="focus" forced>
        <Static status="idle" forcedState="focus" />
      </StateCell>
      <StateCell primitive="transport" state="disabled">
        <Static status="disabled" />
      </StateCell>
      <StateCell primitive="transport" state="loading">
        <Static status="loading" />
      </StateCell>
      <StateCell primitive="transport" state="empty">
        <Static status="empty" />
      </StateCell>
      <StateCell primitive="transport" state="error">
        <Static status="error" />
      </StateCell>
      <StateCell primitive="transport" state="unsupported" forced>
        <Static status="unsupported" />
      </StateCell>
      <StateCell primitive="transport" state="medium" note="56 px play button, 28 px readout (cards).">
        <Static status="idle" size="medium" position={PLAYING_AT} />
      </StateCell>
      <StateCell primitive="transport" state="medium-compare" note="64 px play button (compare).">
        <Static status="idle" size="medium" medium="compare" position={PLAYING_AT} />
      </StateCell>
      <StateCell primitive="transport" state="large" span="full" note="On a band: 96 px play button on desktop (80 tablet, 72 phone), 40 px readout (28 on a phone).">
        <BandSection as="div" className="p-6">
          <Static status="idle" size="large" tone="band" position={PLAYING_AT} showScrub showHint />
        </BandSection>
      </StateCell>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </FixtureSection>
  );
}
