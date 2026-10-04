/**
 * Hand-written PCM16 WAV parser (DS-03). Pure: no DOM, no Web Audio, so it can move into a Worker.
 * It deliberately does not use decodeAudioData, which resamples to the audio context rate and
 * would change the numbers the spectrogram is computed from.
 *
 * Only first-party committed excerpts are parsed in this phase; every chunk size is still checked
 * against the buffer length (T-04-03-01) and a malformed file raises WavFormatError.
 */

export class WavFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WavFormatError';
  }
}

export type ParsedWav = {
  sampleRate: number;
  /** Channel count of the file; `samples` is already averaged to mono. */
  channels: number;
  /** Mono samples scaled by 1 / 32768, in [-1, 1). */
  samples: Float32Array;
};

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const FMT_MIN_BYTES = 16;
const FORMAT_PCM = 1;

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export function parseWavPcm16(buffer: ArrayBuffer): ParsedWav {
  if (buffer.byteLength < RIFF_HEADER_BYTES) throw new WavFormatError('File is too short to be a WAV');
  const view = new DataView(buffer);
  if (fourCC(view, 0) !== 'RIFF' || fourCC(view, 8) !== 'WAVE') throw new WavFormatError('Not a RIFF/WAVE file');

  let fmt: { channels: number; sampleRate: number } | null = null;
  let offset = RIFF_HEADER_BYTES;

  while (offset + CHUNK_HEADER_BYTES <= buffer.byteLength) {
    const id = fourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + CHUNK_HEADER_BYTES;
    if (size > buffer.byteLength - body) {
      throw new WavFormatError(`Chunk "${id}" declares ${size} bytes but the file has ${buffer.byteLength - body}`);
    }

    if (id === 'fmt ') {
      if (size < FMT_MIN_BYTES) throw new WavFormatError('The fmt chunk is too small');
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bits = view.getUint16(body + 14, true);
      if (format !== FORMAT_PCM) throw new WavFormatError(`Unsupported WAV format code ${format}; only PCM (1) is read`);
      if (bits !== 16) throw new WavFormatError(`Unsupported bit depth ${bits}; only 16-bit PCM is read`);
      if (channels < 1) throw new WavFormatError('The file declares zero channels');
      if (sampleRate < 1) throw new WavFormatError('The file declares a zero sample rate');
      fmt = { channels, sampleRate };
    } else if (id === 'data') {
      if (!fmt) throw new WavFormatError('The data chunk comes before the fmt chunk');
      const frameBytes = fmt.channels * 2;
      const frames = Math.floor(size / frameBytes);
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        const frameStart = body + i * frameBytes;
        for (let c = 0; c < fmt.channels; c++) sum += view.getInt16(frameStart + c * 2, true);
        samples[i] = sum / fmt.channels / 32768;
      }
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, samples };
    }

    // Chunks are word aligned: an odd-sized chunk is followed by one pad byte.
    offset = body + size + (size % 2);
  }

  throw new WavFormatError(fmt ? 'No data chunk found' : 'No fmt chunk found');
}
