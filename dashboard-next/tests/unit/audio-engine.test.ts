import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnequalLengthError, createAudioEngine, equalPowerGains, isAudioSupported } from '@/features/instrument';

/**
 * A fake AudioContext: decodeAudioData reads the clip length out of the first four bytes of the
 * input (a test-only stand-in for a real file; the test signals never ship), and currentTime is
 * advanced by hand.
 */
class FakeParam {
  value = 1;
  targets: Array<{ value: number; time: number; constant: number }> = [];
  setTargetAtTime(value: number, time: number, constant: number) {
    this.targets.push({ value, time, constant });
  }
}
class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  startArgs: Array<[number, number]> = [];
  stopped = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start(when: number, offset: number) {
    this.startArgs.push([when, offset]);
  }
  stop() {
    this.stopped = true;
  }
}

function makeContext() {
  const created = { sources: [] as FakeSource[], gains: [] as FakeGain[] };
  const ctx = {
    currentTime: 0,
    state: 'suspended' as string,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
    decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => ({ duration: new DataView(bytes).getUint32(0) / 1000 })),
    createBufferSource: () => {
      const source = new FakeSource();
      created.sources.push(source);
      return source;
    },
    createGain: () => {
      const gain = new FakeGain();
      created.gains.push(gain);
      return gain;
    },
  };
  return { ctx, created };
}

function clipBytes(durationMs: number): ArrayBuffer {
  const bytes = new ArrayBuffer(16);
  new DataView(bytes).setUint32(0, durationMs);
  return bytes;
}

function setup() {
  const made = makeContext();
  const factory = vi.fn(() => made.ctx as unknown as AudioContext);
  const engine = createAudioEngine({ contextFactory: factory });
  return { ...made, factory, engine };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('equalPowerGains', () => {
  it('is a=1,b=0 at 0 and a=0,b=1 at 1 exactly', () => {
    expect(equalPowerGains(0)).toEqual({ a: 1, b: 0 });
    expect(equalPowerGains(1)).toEqual({ a: 0, b: 1 });
  });

  it('is about 0.7071 each at the middle', () => {
    const { a, b } = equalPowerGains(0.5);
    expect(a).toBeCloseTo(0.7071, 4);
    expect(b).toBeCloseTo(0.7071, 4);
  });

  it('keeps a^2 + b^2 = 1 across the range', () => {
    for (let step = 0; step <= 100; step++) {
      const { a, b } = equalPowerGains(step / 100);
      expect(a * a + b * b).toBeCloseTo(1, 10);
    }
  });

  it('clamps out-of-range and non-finite positions', () => {
    expect(equalPowerGains(-3)).toEqual({ a: 1, b: 0 });
    expect(equalPowerGains(7)).toEqual({ a: 0, b: 1 });
    expect(equalPowerGains(Number.NaN)).toEqual({ a: 1, b: 0 });
  });
});

describe('isAudioSupported', () => {
  it('is false without AudioContext and true with either constructor', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(isAudioSupported()).toBe(false);
    vi.stubGlobal('webkitAudioContext', class {});
    expect(isAudioSupported()).toBe(true);
  });
});

describe('createAudioEngine', () => {
  it('creates no AudioContext until the first play call', async () => {
    const { engine, factory, ctx } = setup();
    engine.load('a', clipBytes(30000));
    expect(factory).not.toHaveBeenCalled();
    expect(engine.position()).toBe(0);
    engine.setGains({ a: 0.5 });
    engine.pause();
    expect(factory).not.toHaveBeenCalled();
    const started = engine.play({ ids: ['a'] });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await expect(started).resolves.toBe(true);
  });

  it('creates and resumes the context synchronously inside play, before any await', () => {
    const { engine, factory, ctx } = setup();
    engine.load('a', clipBytes(30000));
    void engine.play({ ids: ['a'] });
    // No microtask has run yet: this is the user-gesture window.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('decodes a copy, so the caller keeps its bytes', async () => {
    const { engine, ctx } = setup();
    const original = clipBytes(30000);
    engine.load('a', original);
    await engine.play({ ids: ['a'] });
    const passed = ctx.decodeAudioData.mock.calls[0][0];
    expect(passed).not.toBe(original);
    expect(original.byteLength).toBe(16);
  });

  it('rejects buffers of different durations with UnequalLengthError and starts nothing', async () => {
    const { engine, created } = setup();
    engine.load('a', clipBytes(30000));
    engine.load('b', clipBytes(25000));
    await expect(engine.play({ ids: ['a', 'b'] })).rejects.toBeInstanceOf(UnequalLengthError);
    expect(created.sources).toHaveLength(0);
    expect(engine.isPlaying()).toBe(false);
  });

  it('rejects an unknown id', async () => {
    const { engine } = setup();
    await expect(engine.play({ ids: ['missing'] })).rejects.toThrow(/No recording is loaded/);
  });

  it('starts several clips from one start time, each through its own gain', async () => {
    const { engine, created } = setup();
    engine.load('a', clipBytes(30000));
    engine.load('b', clipBytes(30000));
    await engine.play({ ids: ['a', 'b'], offset: 4, gains: { a: 1, b: 0 } });
    expect(created.sources).toHaveLength(2);
    expect(created.gains).toHaveLength(2);
    expect(created.sources[0].startArgs).toEqual([[0, 4]]);
    expect(created.sources[1].startArgs).toEqual([[0, 4]]);
    expect(created.gains.map((g) => g.gain.value)).toEqual([1, 0]);
  });

  it('reports position as context time minus start plus offset while playing, the held offset while paused', async () => {
    const { engine, ctx } = setup();
    engine.load('a', clipBytes(30000));
    ctx.currentTime = 10;
    await engine.play({ ids: ['a'], offset: 3 });
    ctx.currentTime = 12.5;
    expect(engine.position()).toBeCloseTo(5.5, 6);
    engine.pause();
    ctx.currentTime = 40;
    expect(engine.position()).toBeCloseTo(5.5, 6);
    expect(engine.isPlaying()).toBe(false);
  });

  it('resumes from the paused offset', async () => {
    const { engine, ctx, created } = setup();
    engine.load('a', clipBytes(30000));
    await engine.play({ ids: ['a'] });
    ctx.currentTime = 2;
    engine.pause();
    ctx.currentTime = 9;
    await engine.play({ ids: ['a'] });
    expect(created.sources[1].startArgs).toEqual([[9, 2]]);
  });

  it('seeks while paused and restarts sources in place while playing', async () => {
    const { engine, ctx, created } = setup();
    engine.load('a', clipBytes(30000));
    engine.seek(7);
    expect(engine.position()).toBe(7);
    await engine.play({ ids: ['a'] });
    expect(created.sources[0].startArgs).toEqual([[0, 7]]);
    ctx.currentTime = 1;
    engine.seek(20);
    expect(created.sources[0].stopped).toBe(true);
    expect(created.sources[1].startArgs).toEqual([[1, 20]]);
    expect(engine.position()).toBe(20);
  });

  it('smooths gain changes with a 15 ms time constant and remembers them', async () => {
    const { engine, ctx, created } = setup();
    engine.load('a', clipBytes(30000));
    engine.load('b', clipBytes(30000));
    await engine.play({ ids: ['a', 'b'] });
    ctx.currentTime = 3;
    engine.setGains({ a: 0.25, b: 0.75 });
    expect(created.gains[0].gain.targets).toEqual([{ value: 0.25, time: 3, constant: 0.015 }]);
    expect(created.gains[1].gain.targets).toEqual([{ value: 0.75, time: 3, constant: 0.015 }]);
    engine.seek(10);
    expect(created.gains[2].gain.value).toBe(0.25);
    expect(created.gains[3].gain.value).toBe(0.75);
  });

  it('calls onEnded once when the first source ends, and holds the end position', async () => {
    const { engine, created } = setup();
    const ended = vi.fn();
    engine.onEnded(ended);
    engine.load('a', clipBytes(30000));
    await engine.play({ ids: ['a'] });
    created.sources[0].onended?.();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(engine.isPlaying()).toBe(false);
    expect(engine.position()).toBe(30);
  });

  it('does not report ended after a pause (the stopped source is detached)', async () => {
    const { engine, created } = setup();
    const ended = vi.fn();
    engine.onEnded(ended);
    engine.load('a', clipBytes(30000));
    await engine.play({ ids: ['a'] });
    engine.pause();
    expect(created.sources[0].onended).toBeNull();
    expect(ended).not.toHaveBeenCalled();
  });

  it('restarts from the start when played again after the end', async () => {
    const { engine, created } = setup();
    engine.load('a', clipBytes(30000));
    await engine.play({ ids: ['a'] });
    created.sources[0].onended?.();
    await engine.play({ ids: ['a'] });
    expect(created.sources[1].startArgs[0][1]).toBe(0);
  });

  it('cancels a play that is still decoding when pause is called', async () => {
    const { engine, created } = setup();
    engine.load('a', clipBytes(30000));
    const started = engine.play({ ids: ['a'] });
    engine.pause();
    await expect(started).resolves.toBe(false);
    expect(created.sources).toHaveLength(0);
  });

  it('dispose stops audio, closes the context and allows loading again', async () => {
    const { engine, ctx, created } = setup();
    engine.load('a', clipBytes(30000));
    await engine.play({ ids: ['a'] });
    engine.dispose();
    expect(created.sources[0].stopped).toBe(true);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(engine.isPlaying()).toBe(false);
    await expect(engine.play({ ids: ['a'] })).rejects.toThrow(/No recording is loaded/);
  });
});
