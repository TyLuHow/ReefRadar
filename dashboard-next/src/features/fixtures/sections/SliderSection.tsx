'use client';

import type { ReactNode } from 'react';
import { demoPair } from '@/lib/audio-manifest';
import { RangeSlider, Slider, type SliderForcedState, type SliderState } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Slider and RangeSlider (DS-04). Both parameters come from the data: the playback position runs
 * over the real clip duration and the frequency range over the Nyquist frequency of the real
 * excerpts, both read from the audio manifest (every committed excerpt is 30 s at 16 kHz, so the
 * pair's first excerpt speaks for all). The single slider is "Playback position", not the UI-SPEC
 * "Dynamic range floor": CONTEXT fixes one shared level range for every well, so a floor control
 * would contradict the scale. Hover, focus and pressed are forced onto the thumbs and say so; the
 * disabled, loading, empty and error cells are props on the same controls.
 */

export const SLIDER_META: FixtureSectionMeta = {
  slug: 'slider',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Slider and RangeSlider',
  contract:
    'Arrow keys change the value by one step, PageUp and PageDown by ten steps, Home and End jump to the ends. The two thumbs of a RangeSlider are named minimum and maximum and cannot cross. The value is always words with its unit.',
  data: 'data/audio-manifest.json: duration_s and sample_rate_hz of the demo-pair excerpts (clip length and Nyquist frequency); states are forced with data-force-* attributes, isDisabled and state',
};

const excerpt = demoPair().a;
/** Length of the real clip, in seconds. */
const CLIP_SECONDS = excerpt.duration_s;
/** Nyquist frequency of the real excerpts, in hertz. */
const NYQUIST_HZ = excerpt.sample_rate_hz / 2;

/** Seconds as m:ss. */
export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const positionText = (seconds: number) => `${formatClock(seconds)} of ${formatClock(CLIP_SECONDS)}`;
const hertzText = (hertz: number) => `${hertz.toLocaleString('en-US')} Hz`;

interface PairProps {
  forcedState?: SliderForcedState;
  isDisabled?: boolean;
  state?: SliderState;
  tone?: 'light' | 'well';
  playbackDefault?: number;
  rangeDefault?: [number, number];
  playbackError?: ReactNode;
  rangeError?: ReactNode;
}

/** The single slider and the range slider over the real clip and the real Nyquist frequency. */
function Pair({ forcedState, isDisabled, state, tone, playbackDefault = 12, rangeDefault = [2000, 6000], playbackError, rangeError }: PairProps) {
  return (
    <div className="flex flex-col gap-6">
      <Slider
        label="Playback position"
        minValue={0}
        maxValue={CLIP_SECONDS}
        step={0.1}
        defaultValue={playbackDefault}
        formatValueText={positionText}
        formatEndLabel={formatClock}
        forcedState={forcedState}
        isDisabled={isDisabled}
        state={state}
        tone={tone}
        errorText={playbackError}
      />
      <RangeSlider
        label="Frequency range"
        minValue={0}
        maxValue={NYQUIST_HZ}
        step={100}
        defaultValue={rangeDefault}
        formatValueText={hertzText}
        forcedState={forcedState}
        isDisabled={isDisabled}
        state={state}
        tone={tone}
        errorText={rangeError}
      />
    </div>
  );
}

const CLIP_NOTE = `Clip ${formatClock(CLIP_SECONDS)} (${excerpt.excerpt_id}), Nyquist ${hertzText(NYQUIST_HZ)}.`;

export function SliderSection() {
  return (
    <FixtureSection {...SLIDER_META}>
      <StateCell primitive="slider" state="default" note={`${CLIP_NOTE} Try Tab, the arrow keys, PageUp, PageDown, Home and End.`}>
        <Pair />
      </StateCell>
      <StateCell primitive="slider" state="hover" forced note="Applied to the thumbs.">
        <Pair forcedState="hover" />
      </StateCell>
      <StateCell primitive="slider" state="focus" forced note="Applied to the thumbs.">
        <Pair forcedState="focus" />
      </StateCell>
      <StateCell primitive="slider" state="pressed" forced note="Applied to the thumbs.">
        <Pair forcedState="pressed" />
      </StateCell>
      <StateCell primitive="slider" state="disabled" note="Both controls are disabled.">
        <Pair isDisabled />
      </StateCell>
      <StateCell primitive="slider" state="loading">
        <Pair state="loading" />
      </StateCell>
      <StateCell primitive="slider" state="empty">
        <Pair state="empty" />
      </StateCell>
      <StateCell
        primitive="slider"
        state="error"
        forced
        note="A requested value outside the range is held at the end of the range and marked invalid."
      >
        <Pair
          state="error"
          playbackDefault={CLIP_SECONDS}
          rangeDefault={[NYQUIST_HZ, NYQUIST_HZ]}
          playbackError={`Choose a value between 0 and ${CLIP_SECONDS} seconds.`}
          rangeError={`Choose a range between 0 and ${NYQUIST_HZ.toLocaleString('en-US')} Hz.`}
        />
      </StateCell>
      <StateCell primitive="slider" state="well-tone" note="On a well. The well track and ink colours.">
        <div className="bg-well p-4">
          <Pair tone="well" />
        </div>
      </StateCell>
    </FixtureSection>
  );
}
