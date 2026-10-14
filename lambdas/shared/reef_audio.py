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

import hashlib
import json
import math
import re
import struct
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

# --- frozen spec ---------------------------------------------------------------

# FROZEN (05-05). Any later change to decode scaling, channel mixing, resampling,
# framing or normalisation requires a new SPEC_VERSION, re-embedding of every
# reference and training window, and a new contract version: the re-embedded
# vectors (05-11) and the successor model (05-12) are tied to these exact window bytes.
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


# --- WAV decode ------------------------------------------------------------------------
#
# decode_wav is the parser of untrusted upload bytes. Every header field is
# bounded BEFORE the payload is converted or a filter is designed (T-05-05-01):
# format tag, bits, channels, block align, sample rate and duration.

MAX_CHANNELS = 8
SUPPORTED_FORMAT_TAGS = (1, 3, 0xFFFE)  # PCM, IEEE float, WAVE_FORMAT_EXTENSIBLE
_WAVE_FORMAT_PCM = 1
_WAVE_FORMAT_FLOAT = 3
_WAVE_FORMAT_EXTENSIBLE = 0xFFFE
_PCM_BITS = (8, 16, 24, 32)
_FLOAT_BITS = (32, 64)


def _convert_payload(
    data: bytes, offset: int, frames: int, channels: int, bits: int, is_float: bool
) -> np.ndarray:
    """Convert `frames` interleaved frames to float32 (frames, channels), full scale = 1.0.

    Integer PCM is divided by 2**(bits-1) (8-bit is unsigned, centred on 128), so
    the most negative value is exactly -1.0 for every depth. Float is stored as is.
    """
    count = frames * channels
    if is_float:
        dtype = "<f4" if bits == 32 else "<f8"
        raw = np.frombuffer(data, dtype=dtype, count=count, offset=offset)
        with np.errstate(over="ignore", invalid="ignore"):
            samples = raw.astype(np.float32)
    elif bits == 8:
        raw = np.frombuffer(data, dtype=np.uint8, count=count, offset=offset)
        samples = (raw.astype(np.float32) - np.float32(128.0)) / np.float32(128.0)
    elif bits == 16:
        raw = np.frombuffer(data, dtype="<i2", count=count, offset=offset)
        samples = raw.astype(np.float32) / np.float32(32768.0)
    elif bits == 24:
        b = np.frombuffer(data, dtype=np.uint8, count=count * 3, offset=offset)
        b = b.reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        v = (v ^ 0x800000) - 0x800000  # sign-extend 24 -> 32 bits
        samples = v.astype(np.float32) / np.float32(8388608.0)
    else:  # 32-bit PCM; float64 division keeps the full 32-bit resolution
        raw = np.frombuffer(data, dtype="<i4", count=count, offset=offset)
        samples = (raw.astype(np.float64) / 2147483648.0).astype(np.float32)
    if is_float and not np.isfinite(samples).all():
        raise InvalidAudioFormatError("WAV contains non-finite (NaN or infinite) float samples")
    return samples.reshape(frames, channels)


def decode_wav(data: bytes) -> DecodedAudio:
    """Parse RIFF/WAVE chunks and decode to float32 (frames, channels) at full scale.

    Accepts PCM 8/16/24/32-bit, IEEE float 32/64-bit and WAVE_FORMAT_EXTENSIBLE
    (SubFormat PCM or float), 1 to MAX_CHANNELS channels, odd chunks with their
    pad byte, and a data chunk that declares more than the file holds (whole
    frames only). `format_tag` on the result is the effective encoding tag (1 or 3).
    Anything else raises a typed error whose message names the offending value.
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
        if chunk_id == b"fmt " and fmt is None:
            if chunk_size < 16 or body + 16 > n:
                raise InvalidAudioFormatError("truncated fmt chunk")
            tag, channels, rate, _byte_rate, block_align, bits = struct.unpack_from(
                "<HHIIHH", data, body
            )
            effective_tag = tag
            if tag == _WAVE_FORMAT_EXTENSIBLE:
                if chunk_size < 40 or body + 40 > n:
                    raise InvalidAudioFormatError("truncated WAVE_FORMAT_EXTENSIBLE fmt chunk")
                # SubFormat GUID starts at offset 24; its first two bytes are the format tag
                (effective_tag,) = struct.unpack_from("<H", data, body + 24)
            fmt = (tag, effective_tag, channels, rate, block_align, bits)
        elif chunk_id == b"data":
            if fmt is None:
                raise InvalidAudioFormatError("missing fmt chunk (data chunk comes first)")
            data_start = body
            data_len = min(chunk_size, n - body)  # tolerate a truncated final chunk
            break
        pos = body + chunk_size + (chunk_size & 1)  # chunks are word aligned

    if fmt is None:
        raise InvalidAudioFormatError("missing fmt chunk")
    if data_start is None:
        raise InvalidAudioFormatError("missing data chunk")

    header_tag, format_tag, channels, sample_rate, block_align, bits = fmt
    if header_tag not in SUPPORTED_FORMAT_TAGS:
        raise InvalidAudioFormatError(
            f"Unsupported WAV format tag {header_tag} (supported: PCM 1, IEEE float 3, extensible 65534)"
        )
    if format_tag not in (_WAVE_FORMAT_PCM, _WAVE_FORMAT_FLOAT):
        raise InvalidAudioFormatError(
            f"Unsupported WAV format tag {format_tag} in the extensible SubFormat (supported: PCM 1, IEEE float 3)"
        )
    if not (1 <= channels <= MAX_CHANNELS):
        raise InvalidAudioFormatError(
            f"Unsupported channel count: {channels} channels (supported: 1 to {MAX_CHANNELS})"
        )
    is_float = format_tag == _WAVE_FORMAT_FLOAT
    if is_float and bits not in _FLOAT_BITS:
        raise InvalidAudioFormatError(f"Unsupported bit depth: {bits}-bit IEEE float (supported: 32, 64)")
    if not is_float and bits not in _PCM_BITS:
        raise InvalidAudioFormatError(f"Unsupported bit depth: {bits}-bit PCM (supported: 8, 16, 24, 32)")
    if block_align != channels * bits // 8:
        raise InvalidAudioFormatError(
            f"Inconsistent block alignment {block_align} for {channels} channels of {bits}-bit samples"
        )
    if not (MIN_SAMPLE_RATE <= sample_rate <= MAX_SAMPLE_RATE):
        raise InvalidAudioFormatError(
            f"Sample rate {sample_rate} Hz outside {MIN_SAMPLE_RATE}-{MAX_SAMPLE_RATE} Hz"
        )

    frames = data_len // block_align  # only frames actually present
    duration_s = frames / float(sample_rate)
    if duration_s > MAX_DURATION_S:
        raise AudioTooLongError(
            f"audio is {duration_s:.1f} s; the maximum is {MAX_DURATION_S:.0f} s"
        )

    samples = _convert_payload(data, data_start, frames, channels, bits, is_float)
    return DecodedAudio(
        samples=samples,
        sample_rate=int(sample_rate),
        channels=int(channels),
        bits_per_sample=int(bits),
        encoding="float" if is_float else "pcm",
        format_tag=int(format_tag),
        frames=int(frames),
        duration_s=duration_s,
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


# --- segment transport: segments.f32 + sidecar JSON -----------------------------------
#
# The preprocessor writes the normalised windows as one binary object (n x
# WINDOW_SAMPLES little-endian float32, C order) and a small JSON sidecar. The
# classifier reads windows with ranged GETs (SEGMENT_BYTES_PER_WINDOW each) and
# verifies the sidecar; offline scripts use the same helpers.

SEGMENTS_FORMAT = "f32le"
SIDECAR_SCHEMA_VERSION = 1
SEGMENT_BYTES_PER_WINDOW = WINDOW_SAMPLES * 4

_SPEC_VERSION_RE = re.compile(r"^[a-z0-9][a-z0-9.+-]*$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_SIDECAR_KEYS = (
    "schema_version",
    "spec_version",
    "segments_format",
    "sample_rate_hz",
    "window_samples",
    "window_s",
    "num_windows",
    "segments_bytes",
    "segments_sha256",
    "levels",
    "input",
    "dropped_tail_s",
)


class SidecarError(ValueError):
    """The segments object or its sidecar is malformed or inconsistent."""


def encode_segments(windows: np.ndarray) -> bytes:
    """Windows (n, WINDOW_SAMPLES) -> little-endian float32 bytes in C order."""
    arr = np.asarray(windows)
    if arr.ndim != 2 or arr.shape[1] != WINDOW_SAMPLES:
        raise SidecarError(f"windows must have shape (n, {WINDOW_SAMPLES}), got {arr.shape}")
    return np.ascontiguousarray(arr, dtype="<f4").tobytes()


def decode_segments(raw: bytes) -> np.ndarray:
    """Inverse of encode_segments; float32 (n, WINDOW_SAMPLES)."""
    if len(raw) % SEGMENT_BYTES_PER_WINDOW != 0:
        raise SidecarError(
            f"segments length {len(raw)} is not a multiple of {SEGMENT_BYTES_PER_WINDOW} bytes"
        )
    arr = np.frombuffer(raw, dtype="<f4").reshape(-1, WINDOW_SAMPLES)
    return arr.astype(np.float32, copy=True)


def build_sidecar(prepared: PreparedAudio, segments_bytes: bytes) -> dict:
    """The JSON-serialisable sidecar describing `segments_bytes` (all values finite)."""
    n = int(prepared.windows.shape[0])
    if len(segments_bytes) != n * SEGMENT_BYTES_PER_WINDOW:
        raise SidecarError(
            f"segments length {len(segments_bytes)} does not match {n} windows "
            f"x {SEGMENT_BYTES_PER_WINDOW} bytes"
        )
    return {
        "schema_version": SIDECAR_SCHEMA_VERSION,
        "spec_version": SPEC_VERSION,
        "segments_format": SEGMENTS_FORMAT,
        "sample_rate_hz": TARGET_SAMPLE_RATE,
        "window_samples": WINDOW_SAMPLES,
        "window_s": WINDOW_S,
        "num_windows": n,
        "segments_bytes": len(segments_bytes),
        "segments_sha256": hashlib.sha256(segments_bytes).hexdigest(),
        "levels": {
            "peak_dbfs": [float(v) for v in prepared.peak_dbfs],
            "rms_dbfs": [float(v) for v in prepared.rms_dbfs],
            "silent": [bool(v) for v in prepared.silent],
        },
        "input": dict(prepared.input),
        "dropped_tail_s": float(prepared.input["dropped_tail_s"]),
    }


def _reject_constant(name: str):
    raise SidecarError(f"non-finite number {name} in sidecar")


def parse_sidecar(raw: bytes) -> dict:
    """Parse and validate sidecar JSON bytes; raises SidecarError on any violation."""
    try:
        sc = json.loads(raw, parse_constant=_reject_constant)
    except SidecarError:
        raise
    except (ValueError, UnicodeDecodeError) as exc:
        raise SidecarError(f"sidecar is not valid JSON: {exc}") from exc
    if not isinstance(sc, dict):
        raise SidecarError("sidecar must be a JSON object")
    missing = [k for k in _SIDECAR_KEYS if k not in sc]
    if missing:
        raise SidecarError(f"sidecar is missing keys: {missing}")

    if sc["schema_version"] != SIDECAR_SCHEMA_VERSION or isinstance(sc["schema_version"], bool):
        raise SidecarError(f"unsupported sidecar schema_version {sc['schema_version']!r}")
    spec = sc["spec_version"]
    if not isinstance(spec, str) or not _SPEC_VERSION_RE.match(spec):
        raise SidecarError(f"invalid spec_version {spec!r}")
    if sc["segments_format"] != SEGMENTS_FORMAT:
        raise SidecarError(f"unsupported segments_format {sc['segments_format']!r}")
    if sc["window_samples"] != WINDOW_SAMPLES or isinstance(sc["window_samples"], bool):
        raise SidecarError(f"window_samples must be {WINDOW_SAMPLES}")
    if sc["sample_rate_hz"] != TARGET_SAMPLE_RATE or isinstance(sc["sample_rate_hz"], bool):
        raise SidecarError(f"sample_rate_hz must be {TARGET_SAMPLE_RATE}")
    if sc["window_s"] != WINDOW_S:
        raise SidecarError(f"window_s must be {WINDOW_S}")

    n = sc["num_windows"]
    if not isinstance(n, int) or isinstance(n, bool) or n < 0:
        raise SidecarError("num_windows must be a non-negative integer")
    size = sc["segments_bytes"]
    if not isinstance(size, int) or isinstance(size, bool) or size != n * SEGMENT_BYTES_PER_WINDOW:
        raise SidecarError(
            f"segments_bytes {size!r} must equal num_windows x {SEGMENT_BYTES_PER_WINDOW}"
        )
    sha = sc["segments_sha256"]
    if not isinstance(sha, str) or not _SHA256_RE.match(sha):
        raise SidecarError("segments_sha256 must be 64 lowercase hex characters")

    levels = sc["levels"]
    if not isinstance(levels, dict) or any(k not in levels for k in ("peak_dbfs", "rms_dbfs", "silent")):
        raise SidecarError("levels must hold peak_dbfs, rms_dbfs and silent")
    for key in ("peak_dbfs", "rms_dbfs", "silent"):
        if not isinstance(levels[key], list) or len(levels[key]) != n:
            raise SidecarError(f"levels.{key} must be a list of length num_windows ({n})")
    for key in ("peak_dbfs", "rms_dbfs"):
        for v in levels[key]:
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < DBFS_FLOOR:
                raise SidecarError(f"levels.{key} holds an invalid value {v!r}")
    if any(not isinstance(v, bool) for v in levels["silent"]):
        raise SidecarError("levels.silent must hold booleans")

    if not isinstance(sc["input"], dict):
        raise SidecarError("input must be an object")
    tail = sc["dropped_tail_s"]
    if isinstance(tail, bool) or not isinstance(tail, (int, float)) or not math.isfinite(tail) or tail < 0:
        raise SidecarError("dropped_tail_s must be a finite non-negative number")
    return sc


# --- playback copy and the machine-readable spec ------------------------------------------


def pcm16_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Mono 16-bit PCM WAV (44-byte header) for browser playback.

    Values are clipped to [-1.0, 1.0] BEFORE the int16 cast, so an over-range
    float never wraps (the old playback copy did). The full-scale code is 32767
    (symmetric: -1.0 and 1.0 map to -32767 and 32767). NaN becomes 0.
    """
    x = np.nan_to_num(np.asarray(samples, dtype=np.float64), nan=0.0, posinf=1.0, neginf=-1.0)
    pcm = np.rint(np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2")
    payload = pcm.tobytes()
    rate = int(sample_rate)
    header = (
        b"RIFF"
        + struct.pack("<I", 36 + len(payload))
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data"
        + struct.pack("<I", len(payload))
    )
    return header + payload


def spec_summary() -> dict:
    """JSON-serialisable description of this spec, for the contract preprocessing_spec."""
    return {
        "spec_version": SPEC_VERSION,
        "sample_rate_hz": TARGET_SAMPLE_RATE,
        "window_s": WINDOW_S,
        "window_samples": WINDOW_SAMPLES,
        "hop_s": HOP_SAMPLES / float(TARGET_SAMPLE_RATE),
        "min_duration_s": MIN_DURATION_S,
        "max_duration_s": MAX_DURATION_S,
        "trailing_partial_window": "dropped",
        "channel_mix": "mean",
        "supported_input": {
            "format_tags": list(SUPPORTED_FORMAT_TAGS),
            "pcm_bits": list(_PCM_BITS),
            "float_bits": list(_FLOAT_BITS),
            "sample_rate_hz_range": [MIN_SAMPLE_RATE, MAX_SAMPLE_RATE],
            "max_channels": MAX_CHANNELS,
        },
        "amplitude_scaling": {
            "pcm8": "unsigned 8-bit: (value - 128) / 128",
            "pcm16": "value / 32768",
            "pcm24": "value / 8388608",
            "pcm32": "value / 2147483648",
            "float32": "as stored",
            "float64": "as stored, cast to float32",
            "full_scale": "the most negative integer code maps to exactly -1.0 for every bit depth and channel count",
            "normalisation": {
                "per_window_dc_removal": True,
                "target_peak": TARGET_PEAK,
                "silent_window": "a window that is all zeros after DC removal stays all zeros and is flagged silent",
                "reference": "perch-hoplite zoo_interface.normalize_audio with taxonomy_model_tf target_peak 0.25, with an explicit silent branch",
            },
        },
        "resampling": {
            "method": "polyphase_kaiser_windowed_sinc",
            "anti_alias_filter": True,
            "kaiser_beta": KAISER_BETA,
            "half_length_factor": HALF_LEN_FACTOR,
            "reference_implementation": "scipy.signal.resample_poly 1.13.1 defaults (Kaiser beta 5.0, half-length 10 x max(up, down), zero padding)",
        },
        "levels": (
            "peak and RMS dBFS of each 5 s window after resampling and before DC removal "
            f"and normalisation, floored at {DBFS_FLOOR}; silent when the DC-removed window is all zeros"
        ),
        "embedding_model": {
            "name": EMBEDDING_MODEL_NAME,
            "version": EMBEDDING_MODEL_VERSION,
            "dimension": EMBEDDING_DIM,
            "kaggle_handle": KAGGLE_MODEL_HANDLE,
            "saved_model_sha256": dict(SAVED_MODEL_SHA256),
        },
    }
