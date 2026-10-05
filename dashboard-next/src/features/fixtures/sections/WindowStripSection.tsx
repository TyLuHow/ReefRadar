'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Spectrogram,
  Transport,
  WindowStrip,
  useTransport,
  windowLevelsDb,
  type SpectrogramHandle,
  type TransportDisplayStatus,
  type WindowCellData,
  type WindowStripProps,
} from '@/features/instrument';
import { attributionLine } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { useFixtureClip, type FixtureClip } from '../parts/useFixtureClip';

/**
 * WindowStrip (DS-05, T-04-15-01): the 5 s windows of the real ind_H1 excerpt, drawn as
 * unclassified cells and as measured-energy cells and NOTHING ELSE. Per-window model output does not
 * exist until Phase 5, so no cell here shows a reading or an abstain: the reading path is exercised
 * only by unit-test inputs (tests/unit/window-strip.test.tsx). The energy shade is the window's RMS
 * level in dB re full scale (uncalibrated), computed by `windowLevelsDb` from the recording itself.
 *
 * The wide cells sit directly under a panel Spectrogram and are inset to its plot area (measured
 * from the DOM), so cell k lies under seconds [5k, 5k + 5). "Window 2" in a note is the second
 * window, the one covering 5 to 10 s (index 1).
 */

export const WINDOW_STRIP_META: FixtureSectionMeta = {
  slug: 'window-strip',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'WindowStrip',
  contract:
    'One 44 px cell per 5 s window, aligned under the spectrogram. The fixtures show unclassified windows and the measured level of each window; no model reading is shown, because per-window model output does not exist yet. One tab stop: arrows move, Home and End jump, Enter or Space selects a window and moves the Transport to its start.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav through data/audio-manifest.json (url_path, duration_s, sample_rate_hz); window levels computed by dsp/levels.ts windowLevelsDb (RMS dB re full scale, 5 s windows); dataset_name from contract sites.json (ind_H1)',
};

const WINDOW_S = 5;
const noop = () => undefined;

function useWindows(fixture: FixtureClip): { plain: WindowCellData[]; energy: WindowCellData[] } {
  const { samples, sampleRate } = fixture.clip;
  return useMemo(() => {
    if (!samples || !sampleRate) return { plain: [], energy: [] };
    const levels = windowLevelsDb(samples, sampleRate, WINDOW_S);
    const bounds = (index: number) => ({ index, startS: index * WINDOW_S, endS: (index + 1) * WINDOW_S, reading: null });
    return {
      plain: levels.map((_, index) => bounds(index)),
      energy: levels.map((db, index) => ({ ...bounds(index), energyDb: db })),
    };
  }, [samples, sampleRate]);
}

/** Measures where the well's plot sits inside `rootRef` so a strip below it can be inset to match. */
function usePlotInset(rootRef: RefObject<HTMLDivElement | null>, loadedKey: string): { paddingInlineStart: number; paddingInlineEnd: number } | undefined {
  const [inset, setInset] = useState<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const plot = root.querySelector('[data-plot]');
      if (!plot) return;
      const outer = root.getBoundingClientRect();
      const box = plot.getBoundingClientRect();
      const next = { start: Math.round(box.left - outer.left), end: Math.round(outer.right - box.right) };
      setInset((previous) => (previous && previous.start === next.start && previous.end === next.end ? previous : next));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [rootRef, loadedKey]);
  return inset ? { paddingInlineStart: inset.start, paddingInlineEnd: inset.end } : undefined;
}

/** A panel well with a strip directly under it, the strip inset to the well's plot area. */
function WellAndStrip({
  fixture,
  strip,
  selectedWindow,
  playheadSeconds,
  children,
}: {
  fixture: FixtureClip;
  strip: Omit<WindowStripProps, 'clipLabel'>;
  selectedWindow?: number;
  playheadSeconds?: number;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inset = usePlotInset(ref, fixture.clip.status);

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <Spectrogram
        variant="panel"
        source={fixture.clip.matrix}
        description={fixture.description}
        caption={fixture.caption}
        state={fixture.wellState}
        selectedWindow={selectedWindow}
        playheadSeconds={playheadSeconds}
      />
      {children}
      <div style={inset}>
        <WindowStrip clipLabel={fixture.excerpt.site_id} expectedCount={6} {...strip} state={fixture.failed ? 'error' : fixture.waiting ? 'loading' : strip.state} />
      </div>
    </div>
  );
}

/** Spectrogram, Transport and strip wired together through useTransport: selecting a window seeks to its start. */
function LiveCell({ fixture, windows }: { fixture: FixtureClip; windows: WindowCellData[] }) {
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const transport = useTransport({ clips: fixture.transportClips, wells: [wellRef], observe: observeRef });
  const [selected, setSelected] = useState<number | undefined>(undefined);

  const status: TransportDisplayStatus = fixture.failed ? 'error' : fixture.waiting ? 'loading' : transport.status;
  const playing = transport.status === 'playing' || transport.status === 'ended';
  const playingIndex = playing && windows.length > 0 ? Math.min(Math.floor(transport.positionS / WINDOW_S), windows.length - 1) : undefined;

  const inset = usePlotInset(observeRef, fixture.clip.status);

  return (
    <div ref={observeRef} className="flex flex-col gap-3">
      <Spectrogram
        ref={wellRef}
        variant="panel"
        source={fixture.clip.matrix}
        description={fixture.description}
        caption={fixture.caption}
        state={fixture.wellState}
        selectedWindow={selected}
        onScrub={transport.seek}
      />
      <div style={inset}>
        <WindowStrip
          clipLabel={fixture.excerpt.site_id}
          windows={windows}
          expectedCount={6}
          selectedIndex={selected}
          playingIndex={playingIndex}
          onSelectWindow={(index) => {
            setSelected(index);
            transport.seek(index * WINDOW_S);
          }}
          state={fixture.failed ? 'error' : fixture.waiting ? 'loading' : undefined}
        />
      </div>
      <Transport
        size="compact"
        status={status}
        position={transport.positionS}
        duration={transport.durationS || fixture.excerpt.duration_s}
        onPlayPause={transport.playPause}
        onStep={transport.step}
        onSeek={transport.seek}
        onRetry={() => window.location.reload()}
        showHint
      />
    </div>
  );
}

function Cells() {
  const fixture = useFixtureClip();
  const { plain, energy } = useWindows(fixture);
  const [selected, setSelected] = useState(1);

  const stripState = fixture.failed ? ('error' as const) : fixture.waiting ? ('loading' as const) : undefined;
  const small = { clipLabel: fixture.excerpt.site_id, expectedCount: 6, state: stripState } satisfies Partial<WindowStripProps>;

  return (
    <>
      <StateCell
        primitive="window-strip"
        state="live"
        span="full"
        note="Select a window (click, or Enter or Space on a focused cell) and the Transport moves to its start; press Play and the playing bar follows. No cell shows a model reading."
      >
        <LiveCell fixture={fixture} windows={energy} />
      </StateCell>
      <StateCell
        primitive="window-strip"
        state="default"
        span="full"
        note="Unclassified: each window is a dashed empty cell, because no model reading exists for it yet."
      >
        <WellAndStrip fixture={fixture} strip={{ windows: plain }} />
      </StateCell>
      <StateCell
        primitive="window-strip"
        state="energy"
        span="full"
        note="Measured energy: the shade is each window's RMS level, from the recording itself, mapped from the clip's quietest to its loudest window."
      >
        <WellAndStrip fixture={fixture} strip={{ windows: energy }} />
      </StateCell>
      <StateCell primitive="window-strip" state="selected" span="full" note="Window 2 (5 s to 10 s) selected; the well outlines the same window. Choose another cell to move it.">
        <WellAndStrip
          fixture={fixture}
          selectedWindow={selected}
          strip={{ windows: energy, selectedIndex: selected, onSelectWindow: setSelected }}
        />
      </StateCell>
      <StateCell primitive="window-strip" state="playing" forced span="full" note="Window 2 selected and playing, playhead forced at 7.5 s.">
        <WellAndStrip fixture={fixture} selectedWindow={1} playheadSeconds={7.5} strip={{ windows: energy, selectedIndex: 1, playingIndex: 1, onSelectWindow: noop }} />
      </StateCell>
      <StateCell primitive="window-strip" state="hover" forced>
        <WindowStrip {...small} windows={energy} forced={{ index: 2, state: 'hover' }} />
      </StateCell>
      <StateCell primitive="window-strip" state="focus" forced>
        <WindowStrip {...small} windows={energy} forced={{ index: 2, state: 'focus' }} />
      </StateCell>
      <StateCell primitive="window-strip" state="disabled" forced>
        <WindowStrip {...small} windows={energy} isDisabled />
      </StateCell>
      <StateCell primitive="window-strip" state="loading">
        <WindowStrip clipLabel={fixture.excerpt.site_id} windows={[]} state="loading" expectedCount={6} />
      </StateCell>
      <StateCell primitive="window-strip" state="empty">
        <WindowStrip clipLabel={fixture.excerpt.site_id} windows={[]} />
      </StateCell>
      <StateCell primitive="window-strip" state="error">
        <WindowStrip clipLabel={fixture.excerpt.site_id} windows={[]} state="error" />
      </StateCell>
      <StateCell
        primitive="window-strip"
        state="dense"
        note="The same six windows in an 80 px wide container: each cell is narrower than 16 px, so the glyphs go, the row keeps its 44 px height and the tooltips carry the detail."
      >
        <div className="w-20">
          <WindowStrip {...small} windows={energy} />
        </div>
      </StateCell>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </>
  );
}

export function WindowStripSection() {
  return (
    <FixtureSection {...WINDOW_STRIP_META}>
      <Cells />
    </FixtureSection>
  );
}
