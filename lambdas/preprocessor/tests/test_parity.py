"""
Parity: the live preprocessor handler and the offline reef_audio function hand
the model identical bytes (plan 05-07, ML-01, success criterion 1).

Inputs are the 9 committed MARRS excerpts plus five generated encodings (stereo
PCM16 44.1 kHz, stereo PCM24 48 kHz, mono float32 96 kHz, mono PCM8 22.05 kHz,
and a 5-channel WAVE_FORMAT_EXTENSIBLE PCM24 file). The handler runs under moto;
the segments it writes are compared with audio_to_windows on the same bytes,
bit for bit. Generated audio exists only in memory, never under
dashboard-next/public.
"""

import numpy as np
import pytest

import reef_audio
from .preproc_wavs import EXCERPT_DIR, generated_wavs

EXCERPTS = sorted(EXCERPT_DIR.glob("*.wav"))
assert len(EXCERPTS) == 9, "the parity matrix expects the 9 committed MARRS excerpts"
CASES = [(p.stem, p.read_bytes()) for p in EXCERPTS] + sorted(generated_wavs().items())
assert len(CASES) == 14


def _assert_parity(preproc, data):
    preproc.run(data)
    offline = reef_audio.audio_to_windows(data)

    raw = preproc.get_bytes("an-1", "segments.f32")
    live = np.frombuffer(raw, "<f4").reshape(-1, reef_audio.WINDOW_SAMPLES)
    assert live.shape == offline.windows.shape
    assert np.array_equal(live, offline.windows)
    assert raw == reef_audio.encode_segments(offline.windows)

    sidecar = reef_audio.parse_sidecar(preproc.get_bytes("an-1", "preprocessing.json"))
    assert sidecar["levels"]["peak_dbfs"] == [float(v) for v in offline.peak_dbfs]
    assert sidecar["levels"]["rms_dbfs"] == [float(v) for v in offline.rms_dbfs]
    assert sidecar["levels"]["silent"] == [bool(v) for v in offline.silent]
    assert sidecar["num_windows"] == offline.windows.shape[0]
    assert sidecar["input"] == offline.input

    playback = preproc.get_bytes("an-1", "audio.wav")
    assert playback == reef_audio.pcm16_wav_bytes(offline.resampled, reef_audio.TARGET_SAMPLE_RATE)


@pytest.mark.parametrize("name,data", CASES, ids=[n for n, _ in CASES])
def test_parity_live_handler_equals_offline(preproc, name, data):
    _assert_parity(preproc, data)
