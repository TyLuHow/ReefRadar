import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayheadClock } from '@/features/instrument/playhead-clock';

/** rAF is replaced by a manual queue so a "frame" runs exactly when the test says. */
let frames: Map<number, FrameRequestCallback>;
let nextId: number;
let rafSpy: ReturnType<typeof vi.fn>;
let cancelSpy: ReturnType<typeof vi.fn>;

function runFrame() {
  const [id, callback] = [...frames.entries()][0] ?? [];
  if (id === undefined || !callback) throw new Error('no frame scheduled');
  frames.delete(id);
  callback(0);
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextId = 1;
  rafSpy = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  cancelSpy = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', rafSpy);
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('createPlayheadClock, reduced motion', () => {
  it('ticks once per 1000 ms and never calls requestAnimationFrame', () => {
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced: true, getPosition: () => 4, onTick });
    clock.start();
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(4);
    expect(rafSpy).not.toHaveBeenCalled();
    clock.stop();
  });

  it('passes the current position to onTick', () => {
    let position = 1;
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced: true, getPosition: () => position, onTick });
    clock.start();
    vi.advanceTimersByTime(1000);
    position = 2;
    vi.advanceTimersByTime(1000);
    expect(onTick.mock.calls.map((call) => call[0])).toEqual([1, 2]);
    clock.stop();
  });

  it('stops ticking after stop()', () => {
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced: true, getPosition: () => 0, onTick });
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not tick on a frame loop even when the page becomes visible again', () => {
    const clock = createPlayheadClock({ reduced: true, getPosition: () => 0, onTick: vi.fn() });
    clock.start();
    setVisibility('hidden');
    setVisibility('visible');
    expect(rafSpy).not.toHaveBeenCalled();
    clock.stop();
  });
});

describe('createPlayheadClock, motion allowed', () => {
  it('schedules requestAnimationFrame while running and none after stop()', () => {
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 2, onTick });
    clock.start();
    expect(frames.size).toBe(1);
    runFrame();
    expect(onTick).toHaveBeenCalledWith(2);
    expect(frames.size).toBe(1);
    runFrame();
    expect(onTick).toHaveBeenCalledTimes(2);
    clock.stop();
    expect(frames.size).toBe(0);
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('uses no interval', () => {
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 0, onTick: vi.fn() });
    clock.start();
    expect(vi.getTimerCount()).toBe(0);
    clock.stop();
  });

  it('stops the frame loop when the document becomes hidden and resumes (with a tick) when visible', () => {
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 6, onTick });
    clock.start();
    expect(frames.size).toBe(1);
    setVisibility('hidden');
    expect(frames.size).toBe(0);
    setVisibility('visible');
    expect(onTick).toHaveBeenCalledWith(6);
    expect(frames.size).toBe(1);
    clock.stop();
    expect(frames.size).toBe(0);
  });

  it('does not start a frame loop while the document is hidden', () => {
    setVisibility('hidden');
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 0, onTick: vi.fn() });
    clock.start();
    expect(frames.size).toBe(0);
    setVisibility('visible');
    expect(frames.size).toBe(1);
    clock.stop();
  });

  it('does not run twice when start() is called twice', () => {
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 0, onTick: vi.fn() });
    clock.start();
    clock.start();
    expect(frames.size).toBe(1);
    clock.stop();
  });

  it('stops listening to visibilitychange after stop()', () => {
    const clock = createPlayheadClock({ reduced: false, getPosition: () => 0, onTick: vi.fn() });
    clock.start();
    clock.stop();
    setVisibility('hidden');
    setVisibility('visible');
    expect(frames.size).toBe(0);
  });
});

describe('createPlayheadClock, tickNow', () => {
  it.each([true, false])('calls onTick immediately with reduced=%s, even when not running', (reduced) => {
    const onTick = vi.fn();
    const clock = createPlayheadClock({ reduced, getPosition: () => 9, onTick });
    clock.tickNow();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(9);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useTransport', () => {
  function stubAudio() {
    const ctx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      decodeAudioData: vi.fn(async () => ({ duration: 30 })),
      createBufferSource: () => ({ buffer: null, onended: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
      createGain: () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
    };
    vi.stubGlobal('AudioContext', function AudioContextStub() {
      return ctx;
    });
    return ctx;
  }

  function stubReduced(reduced: boolean) {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  }

  async function mount() {
    const [{ act, renderHook }, { useTransport }] = await Promise.all([import('@testing-library/react'), import('@/features/instrument')]);
    const wellA = { current: { setPlayhead: vi.fn() } };
    const wellB = { current: { setPlayhead: vi.fn() } };
    const clips = [
      { id: 'a', buffer: new ArrayBuffer(8), durationS: 30 },
      { id: 'b', buffer: new ArrayBuffer(8), durationS: 30 },
    ];
    let renders = 0;
    const hook = renderHook(() => {
      renders++;
      return useTransport({ clips, wells: [wellA, wellB] });
    });
    return { act, hook, wellA, wellB, renders: () => renders };
  }

  it('under reduced motion steps the wells once a second with no frame loop, and the readout follows', async () => {
    const ctx = stubAudio();
    stubReduced(true);
    const { act, hook, wellA, wellB } = await mount();
    await act(async () => {
      hook.result.current.playPause();
    });
    expect(hook.result.current.status).toBe('playing');
    wellA.current.setPlayhead.mockClear();
    wellB.current.setPlayhead.mockClear();

    ctx.currentTime = 1;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(wellA.current.setPlayhead).toHaveBeenCalledTimes(1);
    expect(wellB.current.setPlayhead).toHaveBeenCalledTimes(1);
    expect(wellA.current.setPlayhead.mock.calls[0][0]).toBeCloseTo(1, 6);
    expect(hook.result.current.positionS).toBeCloseTo(1, 6);
    expect(rafSpy).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('with motion allowed drives the wells per frame without a React render per frame', async () => {
    const ctx = stubAudio();
    stubReduced(false);
    const { act, hook, wellA, renders } = await mount();
    await act(async () => {
      hook.result.current.playPause();
    });
    expect(hook.result.current.status).toBe('playing');
    const before = renders();
    wellA.current.setPlayhead.mockClear();
    for (let frame = 1; frame <= 10; frame++) {
      ctx.currentTime = frame * 0.05;
      act(() => runFrame());
    }
    expect(wellA.current.setPlayhead).toHaveBeenCalledTimes(10);
    expect(renders()).toBe(before);
    hook.unmount();
    expect(frames.size).toBe(0);
  });

  it('pausing writes the playhead at once, updates the readout and leaves no loop running', async () => {
    const ctx = stubAudio();
    stubReduced(true);
    const { act, hook, wellA } = await mount();
    await act(async () => {
      hook.result.current.playPause();
    });
    ctx.currentTime = 2.4;
    wellA.current.setPlayhead.mockClear();
    await act(async () => {
      hook.result.current.playPause();
    });
    expect(hook.result.current.status).toBe('idle');
    expect(wellA.current.setPlayhead).toHaveBeenCalledTimes(1);
    expect(wellA.current.setPlayhead.mock.calls[0][0]).toBeCloseTo(2.4, 6);
    expect(hook.result.current.positionS).toBeCloseTo(2.4, 6);
    expect(vi.getTimerCount()).toBe(0);
    hook.unmount();
  });

  it('seek and step land immediately and clamp to the clip', async () => {
    stubAudio();
    stubReduced(true);
    const { act, hook, wellA } = await mount();
    act(() => hook.result.current.seek(12));
    expect(hook.result.current.positionS).toBe(12);
    expect(wellA.current.setPlayhead).toHaveBeenLastCalledWith(12);
    act(() => hook.result.current.step(1));
    expect(hook.result.current.positionS).toBe(17);
    act(() => hook.result.current.step(-1));
    expect(hook.result.current.positionS).toBe(12);
    act(() => hook.result.current.toStart());
    expect(hook.result.current.positionS).toBe(0);
    act(() => hook.result.current.toEnd());
    expect(hook.result.current.positionS).toBe(30);
    expect(hook.result.current.status).toBe('ended');
    hook.unmount();
  });

  it('reports unsupported without Web Audio and never starts anything', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    stubReduced(false);
    const { act, hook } = await mount();
    expect(hook.result.current.status).toBe('unsupported');
    act(() => hook.result.current.playPause());
    expect(hook.result.current.status).toBe('unsupported');
    hook.unmount();
  });
});
