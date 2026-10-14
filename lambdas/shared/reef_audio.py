"""
ML-01: shared audio preprocessing for the live Lambdas and the offline jobs.

One function, `audio_to_windows(wav_bytes)`, turns a WAV upload into the exact
windows SurfPerch embeds: 5 s, 32 kHz, mono, DC-removed and peak-normalised to
0.25 the way perch-hoplite's SurfPerch wrapper does it, plus the per-window
peak and RMS level (dBFS) measured BEFORE that normalisation.

Stdlib plus NumPy only. The zip Lambdas have just the NumPy 1.26.4 layer, so
this module is bundled flat into the preprocessor and classifier zips and the
offline scripts import it through lambdas/shared. SciPy is a test-only oracle
(requirements-dev.txt) and is never imported here.

Spec identity. SPEC_VERSION names the frozen design below. Changing any
constant or algorithm that alters window bytes (the window length, the peak,
the filter design, the dBFS floor) requires a new SPEC_VERSION.

Resampler. `resample_poly` is a pure-NumPy replica of
`scipy.signal.resample_poly` with its default design: a Kaiser-windowed sinc
(beta 5.0, half-length 10 x max(up, down)), cutoff at the lower of the input
and output Nyquist, unity DC gain, zero group delay, zero padding at both
ends. It agrees with SciPy to 1e-12 on float64 input. It is evaluated as a
polyphase bank, one block of outputs at a time, with the input kept in its own
dtype and converted to float64 block by block, so peak memory stays near input
plus output.

Committed filter behaviour (it is part of SPEC_VERSION; say it plainly, do not
call it perfect anti-aliasing). Kaiser beta 5.0 gives about 54 dB of stopband
attenuation. The transition band is about 5.1 kHz wide when downsampling to
32 kHz (flat to about 13.4 kHz, stop from about 18.6 kHz) and about 2.6 kHz
wide for 16 -> 32 kHz upsampling (flat to about 6.7 kHz, about 1.7 dB down at
7 kHz). Content between 17 and 18.6 kHz is only partly attenuated. SurfPerch
embeddings are sensitive to this design, so any other filter needs a new
SPEC_VERSION.

Normalisation (perch-hoplite taxonomy_model_tf.py:54,274 and
zoo_interface.py:157-160). Per window: subtract the window mean, scale so the
largest absolute sample is 0.25. An all-zero window takes an explicit branch
and stays all zeros (upstream `np.divide(where=)` without `out=` would leave
uninitialised memory there).
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

# --- frozen spec ---------------------------------------------------------------

# Hyphens and dots only: the contract version pattern is ^[a-z0-9][a-z0-9.+-]*$.
SPEC_VERSION = "preproc-2026.10.1-reef-audio"

TARGET_SAMPLE_RATE = 32000
WINDOW_S = 5.0
WINDOW_SAMPLES = 160000
HOP_SAMPLES = 160000
TARGET_PEAK = 0.25
KAISER_BETA = 5.0
HALF_LEN_FACTOR = 10
DBFS_FLOOR = -120.0

# Bounds on untrusted input (T-05-02-01): a header rate of 7 Hz would otherwise
# design a 640,001-tap filter.
MIN_SAMPLE_RATE = 4000
MAX_SAMPLE_RATE = 192000
MIN_DURATION_S = 5.0
MAX_DURATION_S = 600.0

# Outputs evaluated per block by the polyphase resampler.
RESAMPLE_BLOCK = 32768

# Embedding model the spec was recorded against (inference.py is not edited in
# Phase 5; the handle is pinned here and in the preprocessing spec).
EMBEDDING_MODEL_NAME = "surfperch"
EMBEDDING_MODEL_VERSION = "1.0"
EMBEDDING_DIM = 1280
KAGGLE_MODEL_HANDLE = "google/surfperch/tensorFlow2/1/1"
SAVED_MODEL_SHA256 = {
    "saved_model.pb": "22269626eef55b37526468fff2ca951847b3bf9547504490067bbb862def1ae2",
    "variables/variables.data-00000-of-00001": "e2971549fa9747b027ff028a4a038034a84181d2fabc97ae8144936eadde65bc",
    "variables/variables.index": "4720752f8deaf6694347ef09f024b8b2614495ee8390a5bc17421de581cb580f",
}

_WAVE_FORMAT_PCM = 1


# --- errors --------------------------------------------------------------------


class ReefAudioError(ValueError):
    """Base class; `error_code` is the code the preprocessor writes to ERROR items."""

    error_code = "INVALID_AUDIO_FORMAT"

    def __init__(self, message: str, error_code: Optional[str] = None):
        super().__init__(message)
        if error_code is not None:
            self.error_code = error_code


class InvalidAudioFormatError(ReefAudioError):
    error_code = "INVALID_AUDIO_FORMAT"


class AudioTooShortError(ReefAudioError):
    error_code = "AUDIO_TOO_SHORT"


class AudioTooLongError(ReefAudioError):
    error_code = "AUDIO_TOO_LONG"


# --- data types ----------------------------------------------------------------


@dataclass
class DecodedAudio:
    """Decoded WAV: float32 samples (frames, channels) scaled to full scale."""

    samples: np.ndarray
    sample_rate: int
    channels: int
    bits_per_sample: int
    encoding: str  # "pcm" or "float"
    format_tag: int
    frames: int
    duration_s: float


@dataclass
class PreparedAudio:
    """Model-ready windows plus the descriptive fields persisted beside them."""

    windows: np.ndarray  # float32 (n, WINDOW_SAMPLES), normalised
    resampled: np.ndarray  # float32 1-D mono 32 kHz signal before normalisation
    peak_dbfs: List[float]  # per window, before DC removal and scaling
    rms_dbfs: List[float]
    silent: List[bool]
    input: dict  # sample_rate_hz, channels, bits_per_sample, encoding, format_tag,
    #              frames, duration_s, dropped_tail_s, spec_version


# --- WAV decode (PCM16 path; the full matrix and header bounds arrive in 05-05) --


def decode_wav(data: bytes) -> DecodedAudio:
    """Parse RIFF/WAVE chunks and decode 16-bit PCM to float32 full scale.

    Any other format raises InvalidAudioFormatError naming the format.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise InvalidAudioFormatError("audio must be bytes")
    data = bytes(data) if not isinstance(data, bytes) else data
    if len(data) < 12 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise InvalidAudioFormatError("not a RIFF/WAVE file")

    fmt = None
    data_start = None
    data_len = 0
    pos = 12
    n = len(data)
    while pos + 8 <= n:
        chunk_id = data[pos : pos + 4]
        (chunk_size,) = struct.unpack_from("<I", data, pos + 4)
        body = pos + 8
        if chunk_id == b"fmt ":
            if chunk_size < 16 or body + 16 > n:
                raise InvalidAudioFormatError("truncated fmt chunk")
            fmt = struct.unpack_from("<HHIIHH", data, body)
        elif chunk_id == b"data":
            data_start = body
            data_len = min(chunk_size, n - body)  # tolerate a truncated final chunk
            break
        pos = body + chunk_size + (chunk_size & 1)  # chunks are word aligned

    if fmt is None:
        raise InvalidAudioFormatError("missing fmt chunk")
    if data_start is None:
        raise InvalidAudioFormatError("missing data chunk")

    format_tag, channels, sample_rate, _byte_rate, block_align, bits = fmt
    if format_tag != _WAVE_FORMAT_PCM or bits != 16:
        raise InvalidAudioFormatError(
            f"unsupported WAV format (format tag {format_tag}, {bits}-bit); "
            "this decoder reads 16-bit PCM"
        )
    if channels < 1:
        raise InvalidAudioFormatError("WAV has no channels")
    if block_align != channels * 2:
        raise InvalidAudioFormatError("inconsistent block alignment in fmt chunk")
    if not (MIN_SAMPLE_RATE <= sample_rate <= MAX_SAMPLE_RATE):
        raise InvalidAudioFormatError(
            f"sample rate {sample_rate} Hz outside {MIN_SAMPLE_RATE}-{MAX_SAMPLE_RATE} Hz"
        )

    frames = data_len // block_align
    raw = np.frombuffer(data, dtype="<i2", count=frames * channels, offset=data_start)
    samples = (raw.astype(np.float32) / np.float32(32768.0)).reshape(frames, channels)
    return DecodedAudio(
        samples=samples,
        sample_rate=int(sample_rate),
        channels=int(channels),
        bits_per_sample=int(bits),
        encoding="pcm",
        format_tag=int(format_tag),
        frames=int(frames),
        duration_s=frames / float(sample_rate),
    )


def mix_to_mono(samples: np.ndarray) -> np.ndarray:
    """Mean over channels, accumulated in float64. (frames, channels) -> (frames,)."""
    arr = np.asarray(samples)
    if arr.ndim == 1:
        return arr.astype(np.float64)
    return arr.mean(axis=1, dtype=np.float64)


# --- polyphase Kaiser resampler ---------------------------------------------------


def design_kaiser_filter(up: int, down: int) -> np.ndarray:
    """scipy.signal.resample_poly's default FIR design, as float64 taps."""
    max_rate = max(up, down)
    half_len = HALF_LEN_FACTOR * max_rate
    n_taps = 2 * half_len + 1
    cutoff = 1.0 / max_rate
    k = np.arange(n_taps, dtype=np.float64) - half_len
    h = cutoff * np.sinc(cutoff * k) * np.kaiser(n_taps, KAISER_BETA)
    h = h / h.sum()
    return h * up


def resample_poly(x: np.ndarray, fs_in: int, fs_out: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    """Resample 1-D `x` from fs_in to fs_out; equals scipy.signal.resample_poly defaults.

    Returns float64. The input may be float32 or float64; it is converted to
    float64 one block at a time. Each output is the tap-by-tap sum
    sum_k bank[r, k] * x[q - k] accumulated in float64 in fixed tap order, so
    the result never depends on the block size or on a BLAS library.
    """
    fs_in = int(fs_in)
    fs_out = int(fs_out)
    if not (MIN_SAMPLE_RATE <= fs_in <= MAX_SAMPLE_RATE) or not (
        MIN_SAMPLE_RATE <= fs_out <= MAX_SAMPLE_RATE
    ):
        raise InvalidAudioFormatError(
            f"sample rate {fs_in} Hz -> {fs_out} Hz outside "
            f"{MIN_SAMPLE_RATE}-{MAX_SAMPLE_RATE} Hz"
        )
    arr = np.asarray(x)
    if arr.ndim != 1:
        raise ValueError("resample_poly expects a 1-D signal")

    g = math.gcd(fs_in, fs_out)
    up = fs_out // g
    down = fs_in // g
    if up == down:
        return arr.astype(np.float64, copy=True)

    n_in = arr.shape[0]
    n_out = (n_in * up + down - 1) // down
    if n_out == 0:
        return np.zeros(0, dtype=np.float64)

    h = design_kaiser_filter(up, down)
    half = (h.shape[0] - 1) // 2
    taps = -(-h.shape[0] // up)  # ceil(n_taps / up)

    # bank_t[k, r] = h[r + k * up]: tap k of phase r (zero where the phase has fewer taps)
    bank_t = np.zeros((taps, up), dtype=np.float64)
    for r in range(up):
        hp = h[r::up]
        bank_t[: hp.shape[0], r] = hp

    block = max(1, int(RESAMPLE_BLOCK))
    y = np.empty(n_out, dtype=np.float64)
    for start in range(0, n_out, block):
        stop = min(start + block, n_out)
        m = np.arange(start, stop, dtype=np.int64)
        t = m * down + half
        q = t // up  # newest input index feeding each output
        r = t - q * up  # polyphase phase

        lo = int(q[0]) - (taps - 1)
        hi = int(q[-1]) + 1
        xb = np.zeros(hi - lo, dtype=np.float64)
        src_lo = max(lo, 0)
        src_hi = min(hi, n_in)
        if src_hi > src_lo:
            xb[src_lo - lo : src_hi - lo] = arr[src_lo:src_hi]  # float32 -> float64 per block

        base = q - lo
        acc = np.zeros(stop - start, dtype=np.float64)
        for k in range(taps):
            acc += xb[base - k] * bank_t[k][r]
        y[start:stop] = acc
    return y


# --- windowing, levels, normalisation -------------------------------------------


def frame_windows(x: np.ndarray) -> np.ndarray:
    """Non-overlapping WINDOW_SAMPLES windows as a view; the trailing partial window is dropped."""
    arr = np.asarray(x)
    n = arr.shape[0] // WINDOW_SAMPLES
    return arr[: n * WINDOW_SAMPLES].reshape(n, WINDOW_SAMPLES)


def _to_dbfs(value: float) -> float:
    if not value > 0.0:
        return DBFS_FLOOR
    return max(DBFS_FLOOR, 20.0 * math.log10(value))


def window_levels(windows: np.ndarray) -> Tuple[List[float], List[float]]:
    """(peak_dbfs, rms_dbfs) per window, in float64, floored at DBFS_FLOOR (never -inf)."""
    peaks: List[float] = []
    rmss: List[float] = []
    for w in windows:
        w64 = np.asarray(w, dtype=np.float64)
        peaks.append(_to_dbfs(float(np.abs(w64).max())))
        rmss.append(_to_dbfs(math.sqrt(float(np.mean(w64 * w64)))))
    return peaks, rmss


def normalise_windows(windows: np.ndarray) -> Tuple[np.ndarray, List[bool]]:
    """Per window: subtract the mean (float64), scale to peak TARGET_PEAK, cast to float32.

    A window with no signal after DC removal is returned as zeros and flagged
    silent through an explicit branch (no masked divide).
    """
    out = np.zeros(windows.shape, dtype=np.float32)
    silent: List[bool] = []
    for i in range(windows.shape[0]):
        w = np.asarray(windows[i], dtype=np.float64)
        w = w - w.mean()
        peak = float(np.abs(w).max())
        if peak > 0.0:
            out[i] = (w * (TARGET_PEAK / peak)).astype(np.float32)
            silent.append(False)
        else:
            silent.append(True)  # out[i] is already zeros
    return out, silent


# --- the one pipeline -------------------------------------------------------------


def audio_to_windows(data: bytes) -> PreparedAudio:
    """WAV bytes -> normalised 5 s / 32 kHz windows plus pre-normalisation levels."""
    decoded = decode_wav(data)
    if decoded.duration_s > MAX_DURATION_S:
        raise AudioTooLongError(
            f"audio is {decoded.duration_s:.1f} s; the maximum is {MAX_DURATION_S:.0f} s"
        )

    if decoded.channels == 1:
        mono = decoded.samples[:, 0]  # float32 view; exact in float64, no whole-signal copy
    else:
        mono = mix_to_mono(decoded.samples)

    resampled = resample_poly(mono, decoded.sample_rate, TARGET_SAMPLE_RATE)
    windows64 = frame_windows(resampled)
    if windows64.shape[0] == 0:
        raise AudioTooShortError(
            f"audio is {decoded.duration_s:.1f} s; at least {MIN_DURATION_S:.0f} s is needed"
        )

    peak_dbfs, rms_dbfs = window_levels(windows64)
    windows, silent = normalise_windows(windows64)
    dropped = (resampled.shape[0] - windows64.shape[0] * WINDOW_SAMPLES) / float(TARGET_SAMPLE_RATE)

    return PreparedAudio(
        windows=windows,
        resampled=resampled.astype(np.float32),
        peak_dbfs=peak_dbfs,
        rms_dbfs=rms_dbfs,
        silent=silent,
        input={
            "sample_rate_hz": decoded.sample_rate,
            "channels": decoded.channels,
            "bits_per_sample": decoded.bits_per_sample,
            "encoding": decoded.encoding,
            "format_tag": decoded.format_tag,
            "frames": decoded.frames,
            "duration_s": decoded.duration_s,
            "dropped_tail_s": dropped,
            "spec_version": SPEC_VERSION,
        },
    )
