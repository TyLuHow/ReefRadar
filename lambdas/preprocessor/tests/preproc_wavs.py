"""
In-memory WAV builders for the preprocessor tests (plan 05-07).

Generated edge-case audio lives only in memory or pytest tmp_path, never
under dashboard-next/public, so check_audio_real and validate_audio_manifest
never see synthetic audio.
"""

import struct
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
EXCERPT_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"

_PCM_SUBFORMAT_TAIL = b"\x00\x00\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71"


def build_wav(payload, *, tag=1, channels=1, rate=32000, bits=16, extensible=False, data_size=None):
    """Hand-built RIFF/WAVE. For extensible files `tag` is the SubFormat tag."""
    block_align = channels * bits // 8
    if extensible:
        fmt = struct.pack("<HHIIHH", 0xFFFE, channels, rate, rate * block_align, block_align, bits)
        fmt += struct.pack("<HHI", 22, bits, 0) + struct.pack("<H", tag) + _PCM_SUBFORMAT_TAIL
    else:
        fmt = struct.pack("<HHIIHH", tag, channels, rate, rate * block_align, block_align, bits)
    declared = len(payload) if data_size is None else data_size
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    body += b"data" + struct.pack("<I", declared) + payload
    if len(payload) & 1:
        body += b"\x00"
    return b"RIFF" + struct.pack("<I", len(body)) + body


def _pcm24(values):
    v = np.asarray(values, dtype=np.int64) & 0xFFFFFF
    out = np.empty((v.size, 3), dtype=np.uint8)
    out[:, 0] = v & 0xFF
    out[:, 1] = (v >> 8) & 0xFF
    out[:, 2] = (v >> 16) & 0xFF
    return out.tobytes()


def _tones(n, rate, channels):
    """Deterministic multi-tone signal in [-0.4, 0.4], shape (n, channels)."""
    t = np.arange(n) / float(rate)
    cols = [
        0.25 * np.sin(2 * np.pi * (300.0 + 110.0 * c) * t)
        + 0.15 * np.sin(2 * np.pi * (1100.0 + 70.0 * c) * t)
        for c in range(channels)
    ]
    return np.stack(cols, axis=1)


def generated_wavs():
    """The five generated edge-case encodings of the parity matrix, by name."""
    out = {}
    n = 12 * 44100
    pcm = np.round(_tones(n, 44100, 2) * 32767).astype("<i2")
    out["stereo_pcm16_44k1_12s"] = build_wav(pcm.tobytes(), channels=2, rate=44100, bits=16)

    n = 12 * 48000
    pcm = np.round(_tones(n, 48000, 2) * 8388607).astype(np.int64).reshape(-1)
    out["stereo_pcm24_48k_12s"] = build_wav(_pcm24(pcm), channels=2, rate=48000, bits=24)

    n = 11 * 96000
    flt = _tones(n, 96000, 1).astype("<f4")
    out["mono_float32_96k_11s"] = build_wav(flt.tobytes(), tag=3, rate=96000, bits=32)

    n = 10 * 22050
    u8 = np.round(_tones(n, 22050, 1)[:, 0] * 127 + 128).astype(np.uint8)
    out["mono_pcm8_22k05_10s"] = build_wav(u8.tobytes(), rate=22050, bits=8)

    n = 10 * 48000
    pcm = np.round(_tones(n, 48000, 5) * 8388607).astype(np.int64).reshape(-1)
    out["five_channel_extensible_pcm24_48k_10s"] = build_wav(
        _pcm24(pcm), tag=1, channels=5, rate=48000, bits=24, extensible=True
    )
    return out
