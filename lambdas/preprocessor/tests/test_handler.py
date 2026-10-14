"""
End-to-end tests for lambdas/preprocessor/handler.py (plan 05-07).

The live handler runs against moto S3/DynamoDB; only the classifier invoke is
a recorder. The handler is a thin wrapper around reef_audio, so the segments
it writes must equal reef_audio's offline output exactly (bit-identity is
swept across more inputs in test_parity.py).
"""

import hashlib
import io
import json
import zipfile
from decimal import Decimal

import numpy as np
import pytest

import lambda_packaging as pkg  # repo-wide pytest.ini pythonpath
import reef_audio
from .preproc_wavs import EXCERPT_DIR, REPO_ROOT, build_wav

EXCERPT = EXCERPT_DIR / "ind_H1_20220830_120000.wav"


@pytest.fixture(scope="module")
def excerpt_bytes():
    return EXCERPT.read_bytes()


def test_handler_writes_binary_segments_sidecar_and_playback(preproc, excerpt_bytes):
    result = preproc.run(excerpt_bytes)
    assert result["statusCode"] == 200

    prepared = reef_audio.audio_to_windows(excerpt_bytes)
    expected = reef_audio.encode_segments(prepared.windows)
    segments = preproc.get_bytes("an-1", "segments.f32")
    assert prepared.windows.shape[0] == 6
    assert len(segments) == 3_840_000
    assert segments == expected

    sidecar = reef_audio.parse_sidecar(preproc.get_bytes("an-1", "preprocessing.json"))
    assert sidecar["spec_version"] == "preproc-2026.10.1-reef-audio"
    assert sidecar["num_windows"] == 6
    assert sidecar["segments_sha256"] == hashlib.sha256(segments).hexdigest()
    assert sidecar["levels"]["peak_dbfs"] == [float(v) for v in prepared.peak_dbfs]

    playback = preproc.get_bytes("an-1", "audio.wav")
    assert playback == reef_audio.pcm16_wav_bytes(prepared.resampled, reef_audio.TARGET_SAMPLE_RATE)
    assert playback[:4] == b"RIFF"

    head = preproc.s3.head_object(Bucket="reefradar-2477-audio", Key="processed/an-1/segments.f32")
    assert head["ContentType"] == "application/octet-stream"
    head = preproc.s3.head_object(Bucket="reefradar-2477-audio", Key="processed/an-1/audio.wav")
    assert head["ContentType"] == "audio/wav"

    # The legacy JSON segments object is no longer written.
    assert not preproc.has_object("an-1", "segments.json")


def test_handler_preprocessed_item_and_classifier_event(preproc, excerpt_bytes):
    preproc.run(excerpt_bytes)

    item = preproc.item("an-1", "PREPROCESSED")
    assert item["status"] == "preprocessed"
    assert item["upload_id"] == "up-1"
    assert item["analysis_id"] == "an-1"
    assert isinstance(item["duration_seconds"], str)
    assert float(item["duration_seconds"]) == pytest.approx(30.0, abs=0.05)
    assert item["num_segments"] == 6
    assert item["processed_key"] == "processed/an-1/audio.wav"
    assert item["segments_key"] == "processed/an-1/segments.f32"
    assert item["segments_format"] == "f32le"
    assert item["preprocessing_key"] == "processed/an-1/preprocessing.json"
    assert item["spec_version"] == "preproc-2026.10.1-reef-audio"
    assert isinstance(item["num_segments"], (int, Decimal))

    assert len(preproc.recorder.calls) == 1
    call = preproc.recorder.calls[0]
    assert call["FunctionName"] == "reefradar-2477-classifier"
    assert call["InvocationType"] == "Event"
    assert json.loads(call["Payload"]) == {
        "upload_id": "up-1",
        "analysis_id": "an-1",
        "segments_key": "processed/an-1/segments.f32",
        "num_segments": 6,
        "segments_format": "f32le",
        "preprocessing_key": "processed/an-1/preprocessing.json",
    }
    assert preproc.item("an-1", "ERROR") is None


def test_handler_coordinates_forwarded_only_when_given(preproc, excerpt_bytes):
    preproc.run(excerpt_bytes, analysis_id="an-none")
    preproc.run(excerpt_bytes, analysis_id="an-geo", latitude=-4.93, longitude=119.32)
    without, with_geo = preproc.invoked_payloads()
    assert "latitude" not in without and "longitude" not in without
    assert with_geo["latitude"] == -4.93
    assert with_geo["longitude"] == 119.32

    # Zero is a real coordinate and must still be forwarded.
    preproc.run(excerpt_bytes, analysis_id="an-zero", latitude=0, longitude=0)
    zero = preproc.invoked_payloads()[-1]
    assert zero["latitude"] == 0 and zero["longitude"] == 0


def test_preprocessor_package_members():
    spec = pkg.load_spec("preprocessor")
    zip_bytes = pkg.build_package(spec, REPO_ROOT)
    manifest = pkg.manifest_from_zip(zip_bytes)
    assert set(manifest) == {"handler.py", "reef_audio.py"}
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    shared = (REPO_ROOT / "lambdas" / "shared" / "reef_audio.py").read_bytes()
    assert zf.read("reef_audio.py").replace(b"\r\n", b"\n") == shared.replace(b"\r\n", b"\n")


# --- error paths: typed ERROR item, re-raise, no segments, no classifier invoke ----------


def _assert_failed_cleanly(preproc, analysis_id="an-1"):
    assert not preproc.has_object(analysis_id, "segments.f32")
    assert not preproc.has_object(analysis_id, "segments.json")
    assert preproc.item(analysis_id, "PREPROCESSED") is None
    assert preproc.recorder.calls == []
    item = preproc.item(analysis_id, "ERROR")
    assert item is not None
    assert item["status"] == "failed"
    assert item["upload_id"] == "up-1"
    return item


def test_handler_invalid_format_error_item(preproc):
    with pytest.raises(reef_audio.InvalidAudioFormatError):
        preproc.run(b"this is definitely not a wav file" * 40)
    item = _assert_failed_cleanly(preproc)
    assert item["error_code"] == "INVALID_AUDIO_FORMAT"
    assert "min_duration_required" not in item and "max_duration_allowed" not in item


def test_handler_too_short_error_item(preproc):
    three_seconds = build_wav(np.zeros(3 * 32000, dtype="<i2").tobytes(), rate=32000, bits=16)
    with pytest.raises(reef_audio.AudioTooShortError):
        preproc.run(three_seconds)
    item = _assert_failed_cleanly(preproc)
    assert item["error_code"] == "AUDIO_TOO_SHORT"
    assert item["min_duration_required"] == "5.0"


def test_handler_too_long_error_item(preproc):
    # 601 s of 8-bit mono at the minimum accepted rate (4 kHz) is a 2.4 MB upload,
    # inside the router's 4 MiB cap and a real 601 s file, not a lying header.
    too_long = build_wav(bytes([128]) * (601 * 4000), rate=4000, bits=8)
    with pytest.raises(reef_audio.AudioTooLongError):
        preproc.run(too_long)
    item = _assert_failed_cleanly(preproc)
    assert item["error_code"] == "AUDIO_TOO_LONG"
    assert item["max_duration_allowed"] == "600.0"


def test_handler_unexpected_failure_is_processing_failed(preproc, monkeypatch, excerpt_bytes):
    def boom(_windows):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(reef_audio, "encode_segments", boom)
    with pytest.raises(RuntimeError):
        preproc.run(excerpt_bytes)
    item = preproc.item("an-1", "ERROR")
    assert item["error_code"] == "PROCESSING_FAILED"
    assert preproc.recorder.calls == []


def test_handler_digital_silence_completes(preproc):
    silence = build_wav(np.zeros(10 * 32000, dtype="<i2").tobytes(), rate=32000, bits=16)
    result = preproc.run(silence)
    assert result["statusCode"] == 200

    sidecar = reef_audio.parse_sidecar(preproc.get_bytes("an-1", "preprocessing.json"))
    assert sidecar["num_windows"] == 2
    assert sidecar["levels"]["peak_dbfs"] == [-120.0, -120.0]
    assert sidecar["levels"]["rms_dbfs"] == [-120.0, -120.0]
    assert sidecar["levels"]["silent"] == [True, True]

    windows = reef_audio.decode_segments(preproc.get_bytes("an-1", "segments.f32"))
    assert windows.shape == (2, reef_audio.WINDOW_SAMPLES)
    assert not windows.any()
    assert np.isfinite(windows).all()
    assert len(preproc.recorder.calls) == 1
    assert preproc.item("an-1", "ERROR") is None
