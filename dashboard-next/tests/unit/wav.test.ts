// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { WavFormatError, parseWavPcm16 } from '@/features/instrument/dsp';
import { CLIP_IDS, readClipBuffer } from './support/clips';

/**
 * WAV parser (04-03). Real excerpts are parsed from disk. The hand-built buffers below are
 * malformed-header fixtures only; they carry no audio and are never rendered or played.
 */

function header(opts: { format?: number; bits?: number; channels?: number; dataBytes?: number; declared?: number }) {
  const { format = 1, bits = 16, channels = 1, dataBytes = 4, declared = dataBytes } = opts;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 16000 * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  ascii(36, 'data');
  view.setUint32(40, declared, true);
  return { buffer, view };
}

describe('parseWavPcm16 on a real excerpt', () => {
  it('reads ind_H1 as 16000 Hz mono, 480000 samples, every sample in [-1, 1)', () => {
    const wav = parseWavPcm16(readClipBuffer('ind_H1_20220830_120000'));
    expect(wav.sampleRate).toBe(16000);
    expect(wav.channels).toBe(1);
    expect(wav.samples).toBeInstanceOf(Float32Array);
    expect(wav.samples.length).toBe(480000);
    let min = Infinity;
    let max = -Infinity;
    for (const s of wav.samples) {
      if (s < min) min = s;
      if (s > max) max = s;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThan(1);
    expect(max - min).toBeGreaterThan(0); // a real recording is not silent
  });

  it.each(CLIP_IDS)('parses %s to 30.0 s at 16000 Hz', (id) => {
    const wav = parseWavPcm16(readClipBuffer(id));
    expect(wav.sampleRate).toBe(16000);
    expect(wav.samples.length / wav.sampleRate).toBe(30);
  });
});

describe('parseWavPcm16 rejects what it cannot read', () => {
  it('throws WavFormatError for a buffer that is not RIFF', () => {
    const { buffer, view } = header({});
    view.setUint8(0, 'X'.charCodeAt(0));
    expect(() => parseWavPcm16(buffer)).toThrow(WavFormatError);
    expect(() => parseWavPcm16(new ArrayBuffer(8))).toThrow(WavFormatError);
  });

  it('throws WavFormatError for format code 3 (float)', () => {
    const { buffer } = header({ format: 3, bits: 32 });
    expect(() => parseWavPcm16(buffer)).toThrow(WavFormatError);
  });

  it('throws WavFormatError for 8-bit PCM', () => {
    const { buffer } = header({ bits: 8 });
    expect(() => parseWavPcm16(buffer)).toThrow(WavFormatError);
  });

  it('bounds-checks the chunk size instead of reading past the end (T-04-03-01)', () => {
    const { buffer } = header({ dataBytes: 4, declared: 0x7fffffff });
    expect(() => parseWavPcm16(buffer)).toThrow(WavFormatError);
    const { buffer: noData } = header({ dataBytes: 0 });
    new DataView(noData).setUint8(36, 'x'.charCodeAt(0)); // data chunk renamed: no data chunk at all
    expect(() => parseWavPcm16(noData)).toThrow(WavFormatError);
  });
});

describe('parseWavPcm16 channel handling and scale', () => {
  it('averages stereo to mono and scales int16 by 1 / 32768', () => {
    const { buffer, view } = header({ channels: 2, dataBytes: 8 });
    view.setInt16(44, 16384, true);
    view.setInt16(46, -16384, true);
    view.setInt16(48, -32768, true);
    view.setInt16(50, -32768, true);
    const wav = parseWavPcm16(buffer);
    expect(wav.channels).toBe(2);
    expect(Array.from(wav.samples)).toEqual([0, -1]);
  });
});
