"""
Tests for lambdas/shared/reef_audio.py (ML-01 shared preprocessing).

`pythonpath = scripts lambdas/shared` in pytest.ini puts lambdas/shared on
sys.path, so `import reef_audio` works the same way as in the deployed zips.

scipy is a TEST-ONLY dependency here (requirements-dev.txt, scipy==1.13.1): it
is the oracle the pure-NumPy resampler is compared against. The library itself
must never import it (test_module_imports_only_stdlib_and_numpy).

All generated audio lives in memory (BytesIO) or pytest's tmp_path, never under
dashboard-next/public. The real MARRS excerpts are read-only inputs.
"""

from __future__ import annotations

import ast
import hashlib
import io
import json
import math
import pathlib
import re
import struct
import sys
import tracemalloc
import wave

import numpy as np
import pytest
from scipy import signal as scipy_signal

import reef_audio as ra

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
MARRS_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"
MODULE_PATH = REPO_ROOT / "lambdas" / "shared" / "reef_audio.py"

EXCERPTS = sorted(MARRS_DIR.glob("*.wav"))

RATES = [8000, 11025, 16000, 22050, 44100, 48000, 96000]


# --- helpers ------------------------------------------------------------------


def make_wav_bytes(samples_int16: np.ndarray, sample_rate: int, channels: int = 1) -> bytes:
    """Build a 16-bit PCM WAV in memory (stdlib `wave`)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(np.asarray(samples_int16, dtype="<i2").tobytes())
    return buf.getvalue()


def oracle_windows(wav_bytes: bytes):
    """Independent oracle: stdlib wave decode, scipy resample, wrapper normalisation.

    Returns (normalised float32 windows, raw float64 windows before DC removal).
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1
        fs = w.getframerate()
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    x = raw.astype(np.float64) / 32768.0
    g = math.gcd(32000, fs)
    y = scipy_signal.resample_poly(x, 32000 // g, fs // g) if fs != 32000 else x.copy()
    n = len(y) // 160000
    raw_windows = y[: n * 160000].reshape(n, 160000)
    out = np.empty(raw_windows.shape, dtype=np.float32)
    for i in range(n):
        w_ = raw_windows[i] - raw_windows[i].mean()
        peak = np.abs(w_).max()
        out[i] = (w_ * (0.25 / peak)).astype(np.float32) if peak > 0 else 0.0
    return out, raw_windows


def noise_plus_tone(seconds: float, fs: int, seed: int = 0) -> np.ndarray:
    rng = np.random.RandomState(seed)
    t = np.arange(int(seconds * fs)) / fs
    return 0.1 * rng.standard_normal(t.size) + 0.5 * np.sin(2 * np.pi * 1000.0 * t)


def tone_level_dbfs(y: np.ndarray, fs: int) -> float:
    """Peak spectral amplitude in dBFS (Hann window, amplitude-corrected)."""
    w = np.hanning(y.size)
    spec = np.abs(np.fft.rfft(y * w)) / (w.sum() / 2.0)
    return 20.0 * math.log10(max(spec.max(), 1e-12))


# --- Task 2: end to end on real excerpts --------------------------------------


def test_excerpts_present():
    assert len(EXCERPTS) == 9, "the 9 committed MARRS excerpts are the real-audio fixture"


@pytest.mark.parametrize("path", EXCERPTS, ids=lambda p: p.stem)
def test_window_excerpts_match_scipy_oracle(path):
    data = path.read_bytes()
    prepared = ra.audio_to_windows(data)

    assert prepared.windows.shape == (6, 160000)
    assert prepared.windows.dtype == np.float32
    assert prepared.input["sample_rate_hz"] == 16000
    assert prepared.input["channels"] == 1
    assert prepared.input["spec_version"] == ra.SPEC_VERSION

    expected, _ = oracle_windows(data)
    assert expected.shape == prepared.windows.shape
    assert np.max(np.abs(prepared.windows - expected)) <= 2e-6


@pytest.mark.parametrize("path", EXCERPTS[:3], ids=lambda p: p.stem)
def test_normalise_peak_and_mean(path):
    prepared = ra.audio_to_windows(path.read_bytes())
    for i, w in enumerate(prepared.windows):
        if prepared.silent[i]:
            continue
        assert abs(float(w.astype(np.float64).mean())) < 1e-6
        assert abs(float(np.abs(w).max()) - 0.25) <= 1e-7


def test_normalise_silent_window_stays_zero():
    windows = np.zeros((2, 160000), dtype=np.float64)
    windows[1] = 0.3 * np.sin(np.arange(160000) * 0.05) + 0.1  # DC offset too
    out, silent = ra.normalise_windows(windows)
    assert out.dtype == np.float32
    assert silent == [True, False]
    assert not np.isnan(out).any()
    assert np.all(out[0] == 0.0)
    assert abs(float(np.abs(out[1]).max()) - 0.25) <= 1e-7

    # whole pipeline: 5 s of digital silence is a valid upload that yields a silent window
    wav = make_wav_bytes(np.zeros(160000, dtype=np.int16), 32000)
    prepared = ra.audio_to_windows(wav)
    assert prepared.silent == [True]
    assert np.all(prepared.windows == 0.0)
    assert prepared.peak_dbfs == [ra.DBFS_FLOOR]
    assert prepared.rms_dbfs == [ra.DBFS_FLOOR]


def test_window_levels_are_pre_normalisation_and_floored():
    path = EXCERPTS[0]
    data = path.read_bytes()
    prepared = ra.audio_to_windows(data)
    _, raw = oracle_windows(data)
    for i in range(raw.shape[0]):
        peak = 20.0 * math.log10(np.abs(raw[i]).max())
        rms = 20.0 * math.log10(math.sqrt(np.mean(raw[i] ** 2)))
        assert prepared.peak_dbfs[i] == pytest.approx(peak, abs=1e-6)
        assert prepared.rms_dbfs[i] == pytest.approx(rms, abs=1e-6)
        # pre-normalisation: the normalised peak would be 20*log10(0.25) = -12.04 dBFS for every window
        assert abs(prepared.peak_dbfs[i] - 20.0 * math.log10(0.25)) > 0.01
        assert math.isfinite(prepared.peak_dbfs[i]) and prepared.peak_dbfs[i] >= ra.DBFS_FLOOR
        assert math.isfinite(prepared.rms_dbfs[i]) and prepared.rms_dbfs[i] >= ra.DBFS_FLOOR

    # silence is floored, never -inf; tiny levels are floored at the same value
    quiet = np.zeros((3, 160000))
    quiet[1, :] = 1e-9  # -180 dBFS
    peaks, rmss = ra.window_levels(quiet)
    assert peaks == [ra.DBFS_FLOOR, ra.DBFS_FLOOR, ra.DBFS_FLOOR]
    assert rmss == [ra.DBFS_FLOOR, ra.DBFS_FLOOR, ra.DBFS_FLOOR]
    loud = np.full((1, 160000), 0.5)
    peaks, rmss = ra.window_levels(loud)
    assert peaks[0] == pytest.approx(-6.0206, abs=1e-3)
    assert rmss[0] == pytest.approx(-6.0206, abs=1e-3)


def test_window_trailing_partial_dropped():
    fs = 32000
    seconds = 12.5
    n = int(seconds * fs)
    t = np.arange(n) / fs
    # a different tone and amplitude in each 5 s segment identifies the window order
    sig = np.zeros(n)
    for i, f in enumerate([300.0, 700.0, 1100.0]):
        a, b = i * 160000, min((i + 1) * 160000, n)
        sig[a:b] = (0.2 + 0.1 * i) * np.sin(2 * np.pi * f * t[a:b])
    data = make_wav_bytes(np.round(sig * 32767).astype(np.int16), fs)

    prepared = ra.audio_to_windows(data)
    assert prepared.windows.shape == (2, 160000)  # 2.5 s tail dropped
    assert prepared.input["dropped_tail_s"] == pytest.approx(2.5)
    expected, _ = oracle_windows(data)
    assert np.max(np.abs(prepared.windows - expected)) <= 2e-6

    one = ra.audio_to_windows(make_wav_bytes(np.round(sig[: int(7.5 * fs)] * 32767).astype(np.int16), fs))
    assert one.windows.shape == (1, 160000)

    # window i starts at i * 5.0 s: window 1 is the 700 Hz segment
    spec = np.abs(np.fft.rfft(prepared.windows[1].astype(np.float64)))
    assert abs(np.argmax(spec) / 5.0 - 700.0) < 1.0


def test_audio_too_short_raises():
    data = make_wav_bytes(np.zeros(int(4.0 * 32000), dtype=np.int16), 32000)
    with pytest.raises(ra.AudioTooShortError) as exc:
        ra.audio_to_windows(data)
    assert exc.value.error_code == "AUDIO_TOO_SHORT"


def test_non_wav_and_wrong_format_rejected():
    with pytest.raises(ra.InvalidAudioFormatError) as exc:
        ra.audio_to_windows(b"this is not a wav file at all, not even close" * 4)
    assert exc.value.error_code == "INVALID_AUDIO_FORMAT"
    assert isinstance(exc.value, ValueError)


def test_window_bytes_deterministic():
    data = EXCERPTS[1].read_bytes()
    a = ra.audio_to_windows(data)
    b = ra.audio_to_windows(data)
    assert np.array_equal(a.windows, b.windows)
    assert a.windows.tobytes() == b.windows.tobytes()
    assert a.peak_dbfs == b.peak_dbfs and a.rms_dbfs == b.rms_dbfs


def test_spec_version_matches_contract_pattern():
    assert ra.SPEC_VERSION == "preproc-2026.10.1-reef-audio"
    assert re.fullmatch(r"^[a-z0-9][a-z0-9.+-]*$", ra.SPEC_VERSION)


def test_embedding_model_identity_recorded():
    assert ra.EMBEDDING_MODEL_NAME == "surfperch"
    assert ra.EMBEDDING_MODEL_VERSION == "1.0"
    assert ra.EMBEDDING_DIM == 1280
    assert ra.KAGGLE_MODEL_HANDLE == "google/surfperch/tensorFlow2/1/1"
    assert set(ra.SAVED_MODEL_SHA256) == {
        "saved_model.pb",
        "variables/variables.data-00000-of-00001",
        "variables/variables.index",
    }
    for digest in ra.SAVED_MODEL_SHA256.values():
        assert re.fullmatch(r"[0-9a-f]{64}", digest)


def test_module_imports_only_stdlib_and_numpy():
    tree = ast.parse(MODULE_PATH.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
    allowed = set(sys.stdlib_module_names) | {"numpy"}
    assert imported <= allowed, f"non-stdlib/numpy imports: {sorted(imported - allowed)}"
    assert "scipy" not in imported


# --- Task 3: resampler parity, anti-aliasing, memory ---------------------------


def _up_down(fs_in: int):
    g = math.gcd(32000, fs_in)
    return 32000 // g, fs_in // g


@pytest.mark.parametrize("fs_in", RATES)
def test_resample_matches_scipy_float64(fs_in):
    x = noise_plus_tone(12.0, fs_in)
    up, down = _up_down(fs_in)
    expected = scipy_signal.resample_poly(x, up, down)
    got = ra.resample_poly(x, fs_in)
    assert got.dtype == np.float64
    assert got.shape == expected.shape
    assert np.max(np.abs(got - expected)) <= 1e-12


@pytest.mark.parametrize("fs_in", RATES)
def test_resample_matches_scipy_float32(fs_in):
    x32 = noise_plus_tone(12.0, fs_in).astype(np.float32)
    up, down = _up_down(fs_in)
    expected = scipy_signal.resample_poly(x32, up, down)
    assert expected.dtype == np.float32
    got = ra.resample_poly(x32, fs_in).astype(np.float32)
    assert got.shape == expected.shape
    assert np.max(np.abs(got.astype(np.float64) - expected.astype(np.float64))) <= 2e-6


def test_resample_block_size_invariance(monkeypatch):
    x = noise_plus_tone(6.0, 44100).astype(np.float32)
    outs = []
    for block in (4096, 32768, 10**7):
        monkeypatch.setattr(ra, "RESAMPLE_BLOCK", block)
        outs.append(ra.resample_poly(x, 44100))
    assert np.array_equal(outs[0], outs[1])
    assert np.array_equal(outs[1], outs[2])


def test_resample_identity_at_target_rate():
    x = noise_plus_tone(1.0, 32000)
    y = ra.resample_poly(x, 32000)
    assert y.dtype == np.float64
    assert np.array_equal(y, x)
    assert y is not x and not np.shares_memory(y, x)
    y[0] = 123.0
    assert x[0] != 123.0


def test_alias_48k_20k_tone_suppressed():
    fs = 48000
    t = np.arange(fs * 2) / fs
    y = ra.resample_poly(0.5 * np.sin(2 * np.pi * 20000.0 * t), fs)
    assert tone_level_dbfs(y[200:-200], 32000) <= -50.0


def test_alias_96k_24k_tone_suppressed():
    fs = 96000
    t = np.arange(fs * 2) / fs
    y = ra.resample_poly(0.5 * np.sin(2 * np.pi * 24000.0 * t), fs)
    assert tone_level_dbfs(y[200:-200], 32000) <= -60.0


def test_resample_passband_level_preserved():
    fs = 16000
    t = np.arange(fs * 3) / fs
    y = ra.resample_poly(0.5 * np.sin(2 * np.pi * 1000.0 * t), fs)
    seg = y[16000:48000]  # exactly 1000 cycles at 32 kHz, clear of the edge transients
    tt = np.arange(seg.size) / 32000.0
    amp = 2.0 / seg.size * abs(np.sum(seg * np.exp(-2j * np.pi * 1000.0 * tt)))
    assert abs(20.0 * math.log10(amp / 0.5)) < 0.1


def test_resample_memory_is_streamed():
    fs = 96000
    n_in = 60 * fs
    x = np.random.RandomState(1).standard_normal(n_in).astype(np.float32)
    tracemalloc.start()
    try:
        y = ra.resample_poly(x, fs)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert y.shape[0] == 60 * 32000
    # a whole-signal float64 copy of the input alone would be 8 bytes x n_in
    assert peak < 8 * n_in


def test_resample_rejects_unbounded_rates():
    x = np.zeros(1000)
    for fs in (0, -5, 7, ra.MIN_SAMPLE_RATE - 1, ra.MAX_SAMPLE_RATE + 1):
        with pytest.raises(ra.InvalidAudioFormatError):
            ra.resample_poly(x, fs)


def test_design_kaiser_filter_matches_scipy_firwin_design():
    up, down = 2, 1
    h = ra.design_kaiser_filter(up, down)
    assert h.dtype == np.float64
    assert h.size == 41  # 2 * 10 * 2 + 1
    assert h.sum() == pytest.approx(up, abs=1e-12)  # DC gain equals up
    ref = scipy_signal.firwin(41, 1.0 / 2, window=("kaiser", 5.0))
    assert np.max(np.abs(h - ref * up)) <= 1e-12


# --- 05-05: hand-built WAVs, so any header field (including hostile ones) can be set ---

_PCM_SUBFORMAT_TAIL = b"\x00\x00\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71"


def build_wav(
    payload: bytes,
    *,
    tag: int = 1,
    channels: int = 1,
    rate: int = 32000,
    bits: int = 16,
    block_align: int | None = None,
    extensible: bool = False,
    pre_chunks: bytes = b"",
    data_size: int | None = None,
    include_fmt: bool = True,
    include_data: bool = True,
) -> bytes:
    """Hand-built RIFF/WAVE. For extensible files `tag` is the SubFormat tag."""
    if block_align is None:
        block_align = channels * bits // 8
    if extensible:
        fmt_body = struct.pack("<HHIIHH", 0xFFFE, channels, rate, rate * block_align, block_align, bits)
        fmt_body += struct.pack("<HHI", 22, bits, 0)  # cbSize, valid bits, channel mask
        fmt_body += struct.pack("<H", tag) + _PCM_SUBFORMAT_TAIL
    else:
        fmt_body = struct.pack("<HHIIHH", tag, channels, rate, rate * block_align, block_align, bits)
    body = b"WAVE"
    if include_fmt:
        body += b"fmt " + struct.pack("<I", len(fmt_body)) + fmt_body
    body += pre_chunks
    if include_data:
        declared = len(payload) if data_size is None else data_size
        body += b"data" + struct.pack("<I", declared) + payload
        if len(payload) & 1 and data_size is None:
            body += b"\x00"
    return b"RIFF" + struct.pack("<I", len(body)) + body


def pcm24_bytes(values) -> bytes:
    """int values in [-2**23, 2**23) -> little-endian 3-byte samples."""
    v = np.asarray(values, dtype=np.int64) & 0xFFFFFF
    out = np.empty((v.size, 3), dtype=np.uint8)
    out[:, 0] = v & 0xFF
    out[:, 1] = (v >> 8) & 0xFF
    out[:, 2] = (v >> 16) & 0xFF
    return out.tobytes()


def stereo_24bit_48k_12s() -> bytes:
    n = 12 * 48000
    t = np.arange(n) / 48000.0
    inter = np.empty(2 * n)
    inter[0::2] = np.round(0.4 * np.sin(2 * np.pi * 440.0 * t) * 8388607)
    inter[1::2] = np.round(0.2 * np.sin(2 * np.pi * 1320.0 * t) * 8388607)
    return build_wav(pcm24_bytes(inter), channels=2, rate=48000, bits=24)


# --- 05-05 Task 1: transport (segments + sidecar), built on a 24-bit stereo upload ---


def test_window_transport_round_trip_stereo_48k_24bit():
    data = stereo_24bit_48k_12s()
    decoded = ra.decode_wav(data)
    assert decoded.samples.shape == (12 * 48000, 2)
    assert decoded.samples.dtype == np.float32
    assert decoded.bits_per_sample == 24

    # full-scale mapping of the 24-bit extremes
    extreme = ra.decode_wav(
        build_wav(pcm24_bytes([-8388608, 0, 8388607, 0]), channels=2, rate=48000, bits=24)
    )
    assert extreme.samples[0, 0] == -1.0
    assert extreme.samples[1, 0] == pytest.approx(8388607 / 8388608)

    prepared = ra.audio_to_windows(data)
    assert prepared.windows.shape == (2, 160000)
    assert prepared.input["bits_per_sample"] == 24 and prepared.input["channels"] == 2

    seg = ra.encode_segments(prepared.windows)
    assert isinstance(seg, bytes)
    assert len(seg) == 2 * 160000 * 4 == 2 * ra.SEGMENT_BYTES_PER_WINDOW
    assert seg == np.ascontiguousarray(prepared.windows).astype("<f4").tobytes()
    back = ra.decode_segments(seg)
    assert back.shape == (2, 160000) and back.dtype == np.float32
    assert np.array_equal(back, prepared.windows)

    sidecar = ra.build_sidecar(prepared, seg)
    raw = json.dumps(sidecar, allow_nan=False).encode("utf-8")
    assert ra.parse_sidecar(raw) == sidecar
    assert sidecar["segments_sha256"] == hashlib.sha256(seg).hexdigest()
    assert sidecar["spec_version"] == ra.SPEC_VERSION
    assert sidecar["segments_format"] == ra.SEGMENTS_FORMAT == "f32le"
    assert sidecar["schema_version"] == ra.SIDECAR_SCHEMA_VERSION == 1
    assert sidecar["num_windows"] == 2 and sidecar["segments_bytes"] == len(seg)
    assert sidecar["window_samples"] == 160000 and sidecar["sample_rate_hz"] == 32000
    assert sidecar["levels"]["peak_dbfs"] == prepared.peak_dbfs
    assert sidecar["input"] == prepared.input
    assert sidecar["dropped_tail_s"] == prepared.input["dropped_tail_s"]


def test_window_transport_decode_segments_rejects_ragged_length():
    with pytest.raises(ra.SidecarError):
        ra.decode_segments(b"\x00" * (ra.SEGMENT_BYTES_PER_WINDOW + 4))


def _good_sidecar():
    prepared = ra.audio_to_windows(make_wav_bytes(np.zeros(160000, dtype=np.int16), 32000))
    return ra.build_sidecar(prepared, ra.encode_segments(prepared.windows))


def _with(key, value):
    def apply(sc):
        sc = json.loads(json.dumps(sc))
        sc[key] = value
        return sc

    return apply


MALFORMED = {
    "schema_version": _with("schema_version", 2),
    "format": _with("segments_format", "f64le"),
    "window_samples": _with("window_samples", 80000),
    "segments_bytes_vs_windows": _with("segments_bytes", 640004),
    "bad_spec_version": _with("spec_version", "Preproc_2026"),
    "bad_sha": _with("segments_sha256", "abc"),
    "levels_length": _with(
        "levels", {"peak_dbfs": [], "rms_dbfs": [-120.0], "silent": [True]}
    ),
    "missing_key": lambda sc: {k: v for k, v in sc.items() if k != "input"},
}


@pytest.mark.parametrize("name", sorted(MALFORMED))
def test_window_sidecar_rejects_malformed(name):
    bad = MALFORMED[name](_good_sidecar())
    with pytest.raises(ra.SidecarError):
        ra.parse_sidecar(json.dumps(bad).encode("utf-8"))


def test_window_sidecar_rejects_non_json_and_non_finite():
    with pytest.raises(ra.SidecarError):
        ra.parse_sidecar(b"not json")
    with pytest.raises(ra.SidecarError):
        ra.parse_sidecar(b"[1, 2]")
    text = json.dumps(_good_sidecar()).replace("-120.0", "NaN", 1)
    with pytest.raises(ra.SidecarError):
        ra.parse_sidecar(text.encode("utf-8"))


def test_window_sidecar_build_checks_segment_length():
    prepared = ra.audio_to_windows(make_wav_bytes(np.zeros(160000, dtype=np.int16), 32000))
    with pytest.raises(ra.SidecarError):
        ra.build_sidecar(prepared, b"\x00" * 100)
