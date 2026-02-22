/**
 * SyntheticAudioGenerator.ts
 *
 * Generates synthetic demo audio buffers that approximate the acoustic
 * characteristics of healthy vs. degraded coral reefs using the Web Audio API.
 *
 * Healthy reef: rich biophony with pink noise, snapping shrimp clicks,
 * fish grunts, and broadband crackle.
 *
 * Degraded reef: sparse soundscape dominated by low-frequency brown noise
 * with occasional distant boat-like rumble.
 */

// ---- helpers ----------------------------------------------------------------

/** Fill a Float32Array region with white noise scaled by `amp`. */
function addWhiteNoise(buffer: Float32Array, amp: number): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] += (Math.random() * 2 - 1) * amp;
  }
}

/**
 * In-place pink-ish noise via Paul Kellet's refined approximation.
 * Adds to the existing buffer rather than overwriting.
 */
function addPinkNoise(buffer: Float32Array, amp: number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < buffer.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    buffer[i] += pink * amp * 0.11; // normalise-ish
  }
}

/**
 * Brown noise (integrated white noise, low-freq dominant).
 */
function addBrownNoise(buffer: Float32Array, amp: number): void {
  let last = 0;
  for (let i = 0; i < buffer.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    buffer[i] += last * amp * 3.5;
  }
}

/**
 * Add a brief exponential-decay click at a given sample position.
 * Models snapping shrimp broadband clicks (2-10 kHz dominant).
 */
function addClick(
  buffer: Float32Array,
  sampleRate: number,
  position: number,
  amp: number,
): void {
  const decaySamples = Math.floor(sampleRate * 0.002); // 2ms decay
  const freqHz = 2000 + Math.random() * 8000; // 2-10kHz
  const omega = (2 * Math.PI * freqHz) / sampleRate;

  for (let i = 0; i < decaySamples && position + i < buffer.length; i++) {
    const envelope = Math.exp(-i / (decaySamples * 0.3));
    buffer[position + i] += Math.sin(omega * i) * envelope * amp;
  }
}

/**
 * Add a short tonal fish grunt (200-800 Hz) centred at `position`.
 */
function addFishGrunt(
  buffer: Float32Array,
  sampleRate: number,
  position: number,
  amp: number,
): void {
  const duration = 0.15 + Math.random() * 0.2; // 150-350 ms
  const samples = Math.floor(sampleRate * duration);
  const freqHz = 200 + Math.random() * 600;
  const omega = (2 * Math.PI * freqHz) / sampleRate;

  for (let i = 0; i < samples && position + i < buffer.length; i++) {
    const t = i / samples; // 0..1
    // Hanning envelope
    const envelope = 0.5 * (1 - Math.cos(2 * Math.PI * t));
    buffer[position + i] += Math.sin(omega * i) * envelope * amp;
  }
}

/**
 * Add broadband high-frequency crackle (biophony shimmer).
 */
function addBiophonyCrackle(
  buffer: Float32Array,
  sampleRate: number,
  amp: number,
): void {
  // Sparse micro-bursts of high-freq noise
  const burstRate = 30; // per second
  const totalBursts = Math.floor((buffer.length / sampleRate) * burstRate);
  for (let b = 0; b < totalBursts; b++) {
    const pos = Math.floor(Math.random() * buffer.length);
    const len = Math.floor(sampleRate * (0.001 + Math.random() * 0.003));
    for (let i = 0; i < len && pos + i < buffer.length; i++) {
      const t = i / len;
      const envelope = Math.sin(Math.PI * t);
      buffer[pos + i] += (Math.random() * 2 - 1) * envelope * amp;
    }
  }
}

/**
 * Low-frequency boat rumble (50-200 Hz).
 */
function addBoatRumble(
  buffer: Float32Array,
  sampleRate: number,
  position: number,
  amp: number,
): void {
  const duration = 1.5 + Math.random() * 2; // 1.5-3.5s
  const samples = Math.floor(sampleRate * duration);
  const freqHz = 50 + Math.random() * 150;
  const omega = (2 * Math.PI * freqHz) / sampleRate;

  for (let i = 0; i < samples && position + i < buffer.length; i++) {
    const t = i / samples;
    // Fade in/out
    const envelope = Math.sin(Math.PI * t) * 0.6;
    buffer[position + i] += Math.sin(omega * i) * envelope * amp;
  }
}

// ---- public API -------------------------------------------------------------

/**
 * Generate an AudioBuffer that sounds like a healthy coral reef.
 *
 * Characteristics:
 * - Pink noise base (moderate amplitude)
 * - Random exponential clicks simulating snapping shrimp (~15/sec, 2-10 kHz)
 * - Periodic fish grunts (200-800 Hz, every 3-8 s)
 * - Broadband high-frequency crackle (biophony)
 */
export function generateHealthyReef(
  audioContext: AudioContext,
  duration: number = 15,
): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // 1. Pink noise base
  addPinkNoise(data, 0.12);

  // 2. Snapping shrimp clicks -- Poisson ~15/s
  const clicksPerSecond = 15;
  let t = 0;
  while (t < length) {
    // Exponential inter-arrival (Poisson)
    const gap = -Math.log(1 - Math.random()) / clicksPerSecond;
    t += Math.floor(gap * sampleRate);
    if (t < length) {
      addClick(data, sampleRate, t, 0.15 + Math.random() * 0.2);
    }
  }

  // 3. Fish grunts every 3-8 seconds
  let gruntTime = Math.floor(sampleRate * (1 + Math.random() * 2));
  while (gruntTime < length) {
    addFishGrunt(data, sampleRate, gruntTime, 0.1 + Math.random() * 0.08);
    gruntTime += Math.floor(sampleRate * (3 + Math.random() * 5));
  }

  // 4. Broadband biophony crackle
  addBiophonyCrackle(data, sampleRate, 0.06);

  // Soft-clip / normalise
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.9) {
    const scale = 0.85 / peak;
    for (let i = 0; i < length; i++) {
      data[i] *= scale;
    }
  }

  return buffer;
}

/**
 * Generate an AudioBuffer that sounds like a degraded coral reef.
 *
 * Characteristics:
 * - Low-amplitude brown noise (mostly < 500 Hz)
 * - Occasional distant low rumble (boat-like, 50-200 Hz)
 * - Very sparse -- mostly quiet
 */
export function generateDegradedReef(
  audioContext: AudioContext,
  duration: number = 15,
): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // 1. Low-amplitude brown noise
  addBrownNoise(data, 0.04);

  // 2. Very faint white noise floor
  addWhiteNoise(data, 0.005);

  // 3. Occasional boat rumble (0-2 per 15s)
  const rumbleCount = Math.floor(Math.random() * 3);
  for (let r = 0; r < rumbleCount; r++) {
    const pos = Math.floor(Math.random() * length * 0.7);
    addBoatRumble(data, sampleRate, pos, 0.06 + Math.random() * 0.04);
  }

  // Normalise
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.9) {
    const scale = 0.85 / peak;
    for (let i = 0; i < length; i++) {
      data[i] *= scale;
    }
  }

  return buffer;
}
