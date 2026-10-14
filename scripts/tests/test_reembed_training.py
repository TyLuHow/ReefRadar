"""
Tests for scripts/reembed_training.py (ML-01, ML-03, ML-06): re-embed the 100
original training files through reef_audio and the deployed inference Lambda.

Everything is stubbed: figshare listing, zip central directory, ranged download
and the inference client. No network and no AWS call happens here.
"""

import hashlib
import json
import pathlib
import struct
import sys
import wave

import numpy as np
import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import reembed_training as rt  # noqa: E402
import reef_audio  # noqa: E402

FILE_ID = "ind_D2_20220830_124200"


def _wav_bytes(seconds=60, rate=16000, seed=3):
    import io

    rng = np.random.default_rng(seed)
    x = (rng.standard_normal(seconds * rate) * 3000).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(x.tobytes())
    return buf.getvalue()


class StubClient:
    """Stands in for InferenceClient; embedding is a pure function of the window."""

    def __init__(self):
        self.embed_calls = []
        self.warmed = 0

    def warm(self):
        self.warmed += 1
        return 200

    def embed(self, windows):
        self.embed_calls.append(len(windows))
        out = np.zeros((len(windows), 1280), dtype=np.float32)
        for i, w in enumerate(windows):
            seed = int.from_bytes(hashlib.sha256(np.ascontiguousarray(w).tobytes()).digest()[:8], "little")
            out[i] = np.random.default_rng(seed).standard_normal(1280).astype(np.float32)
        return out


@pytest.fixture
def inputs(tmp_path):
    """A 2-row original-inputs pair in the committed format (rows.json + .f32)."""
    rng = np.random.default_rng(9)
    X = rng.standard_normal((2, 1280)).astype("<f4")
    emb = tmp_path / "in" / "original.f32"
    emb.parent.mkdir()
    emb.write_bytes(X.tobytes())
    rows = {
        "count": 2,
        "dim": 1280,
        "dtype": "float32-le",
        "embeddings_file": "original.f32",
        "embeddings_sha256": hashlib.sha256(X.tobytes()).hexdigest(),
        "rows": [
            {"row": 0, "file_id": FILE_ID, "site_id": "ind_D2", "country": "Indonesia", "label": "degraded"},
            {"row": 1, "file_id": "ind_D2_20220830_155400", "site_id": "ind_D2", "country": "Indonesia",
             "label": "degraded"},
        ],
    }
    rows_path = tmp_path / "in" / "rows.json"
    rows_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows_path, emb, X


@pytest.fixture
def stub_figshare(monkeypatch):
    wav = _wav_bytes()
    calls = {"listing": 0, "cd": 0, "download": 0}

    def listing():
        calls["listing"] += 1
        return [{"name": "ind_D2.zip", "download_url": "https://example.invalid/ind_D2.zip", "size": 10, "id": 1}]

    def central(url, size):
        calls["cd"] += 1
        return [
            {"filename": f"ind_D2/{FILE_ID}.WAV", "offset": 0, "comp_size": len(wav),
             "uncomp_size": len(wav), "comp_method": 0},
            {"filename": "ind_D2/ind_D2_20220830_155400.WAV", "offset": 0, "comp_size": len(wav),
             "uncomp_size": len(wav), "comp_method": 0},
        ]

    def download(url, entry):
        calls["download"] += 1
        return wav

    monkeypatch.setattr(rt, "list_figshare_files", listing)
    monkeypatch.setattr(rt, "get_zip_central_directory", central)
    monkeypatch.setattr(rt, "download_file_from_zip", download)
    return wav, calls


def _args(inputs, tmp_path, *extra):
    rows_path, emb, _ = inputs
    return [
        "--rows", str(rows_path),
        "--original-embeddings", str(emb),
        "--out-dir", str(tmp_path / "out"),
        "--cache-dir", str(tmp_path / "cache"),
        *extra,
    ]


def test_reembed_one_row_end_to_end(inputs, stub_figshare, tmp_path, monkeypatch):
    wav, calls = stub_figshare
    client = StubClient()
    monkeypatch.setattr(rt, "make_client", lambda profile: client)

    rc = rt.main(_args(inputs, tmp_path, "--limit", "1", "--confirm"))
    assert rc == 0

    out = tmp_path / "out"
    raw = (out / "reembedded.f32").read_bytes()
    assert len(raw) == 1 * 1280 * 4
    doc = json.loads((out / "reembedded.json").read_text(encoding="utf-8"))
    assert doc["schema_version"] == 1 and doc["count"] == 1 and doc["dim"] == 1280
    assert doc["dtype"] == "float32-le"
    assert doc["embeddings_file"] == "reembedded.f32"
    assert doc["embeddings_sha256"] == hashlib.sha256(raw).hexdigest()
    assert doc["spec_version"] == reef_audio.SPEC_VERSION
    assert doc["dataset"]["doi"] == "10.5522/04/29958062"
    assert doc["dataset"]["figshare_article"] == 29958062
    assert doc["dataset"]["licence"] == "CC BY 4.0"
    assert doc["source_rows"]["sha256"] == hashlib.sha256(inputs[0].read_bytes()).hexdigest()
    inf = doc["inference"]
    assert inf["batch_size"] == 10 and inf["kaggle_handle_pin"] == reef_audio.KAGGLE_MODEL_HANDLE
    assert "not rebuilt" in inf["container_note"]

    (row,) = doc["rows"]
    expected = reef_audio.audio_to_windows(wav)
    w0 = np.ascontiguousarray(expected.windows[0], dtype="<f4").tobytes()
    assert row["row"] == 0 and row["file_id"] == FILE_ID and row["site_id"] == "ind_D2"
    assert row["label"] == "degraded"
    assert row["zip_name"] == "ind_D2.zip" and row["entry_name"] == f"ind_D2/{FILE_ID}.WAV"
    assert row["wav_bytes"] == len(wav) and row["wav_sha256"] == hashlib.sha256(wav).hexdigest()
    assert row["window_index"] == 0
    assert row["window_sha256"] == hashlib.sha256(w0).hexdigest()
    assert row["peak_dbfs"] == expected.peak_dbfs[0] and row["rms_dbfs"] == expected.rms_dbfs[0]
    assert row["silent"] is False

    # embedding is the stub's function of exactly window 0
    got = np.frombuffer(raw, dtype="<f4").reshape(1, 1280)
    assert np.array_equal(got, client.embed([expected.windows[0]]))

    probe = doc["drift_probe"]
    assert probe["pairs"] == 1
    X = inputs[2]
    a, b = X[0].astype(np.float64), got[0].astype(np.float64)
    cos = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
    assert probe["cosine"]["mean"] == pytest.approx(cos)
    assert probe["cosine"]["min"] == probe["cosine"]["max"] == probe["cosine"]["median"] == pytest.approx(cos)
    assert "first window re-embedded through reef_audio" in probe["note"]

    assert client.warmed == 1 and client.embed_calls[-1] == 1
    assert calls["listing"] == 1 and calls["download"] == 1
    # the WAV is cached under its file id
    assert (tmp_path / "cache" / f"{FILE_ID}.WAV").read_bytes() == wav


def test_reembed_requires_confirm_for_aws(inputs, stub_figshare, tmp_path, monkeypatch, capsys):
    _, calls = stub_figshare

    def boom(profile):
        raise AssertionError("client factory must not be called without --confirm")

    monkeypatch.setattr(rt, "make_client", boom)
    for extra in ([], ["--dry-run"], ["--dry-run", "--confirm"]):
        rc = rt.main(_args(inputs, tmp_path, *extra))
        assert rc == 0
    text = capsys.readouterr().out
    assert "ind_D2" in text and "2 file" in text
    assert calls == {"listing": 0, "cd": 0, "download": 0}  # plan mode is fully offline
    assert not (tmp_path / "out" / "reembedded.json").exists()


def test_reembed_refuses_wrong_size(inputs, stub_figshare, tmp_path, monkeypatch):
    wav, _ = stub_figshare
    monkeypatch.setattr(rt, "download_file_from_zip", lambda url, entry: wav[:-2])
    monkeypatch.setattr(rt, "make_client", lambda profile: StubClient())
    rc = rt.main(_args(inputs, tmp_path, "--limit", "1", "--confirm"))
    assert rc == 1
    assert not (tmp_path / "out" / "reembedded.json").exists()


def test_reembed_refuses_tampered_original_embeddings(inputs, stub_figshare, tmp_path, monkeypatch):
    rows_path, emb, X = inputs
    emb.write_bytes(X[::-1].copy().tobytes())
    monkeypatch.setattr(rt, "make_client", lambda profile: StubClient())
    assert rt.main(_args(inputs, tmp_path, "--limit", "1", "--confirm")) == 1


def test_reembed_missing_zip_entry_is_an_error(inputs, stub_figshare, tmp_path, monkeypatch):
    monkeypatch.setattr(rt, "get_zip_central_directory", lambda url, size: [])
    monkeypatch.setattr(rt, "make_client", lambda profile: StubClient())
    assert rt.main(_args(inputs, tmp_path, "--limit", "1", "--confirm")) == 1


def test_reembed_help_lists_flags(capsys):
    with pytest.raises(SystemExit) as exc:
        rt.main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    for flag in ("--confirm", "--limit", "--dry-run"):
        assert flag in out


# ---------------------------------------------------------------------------
# record_embedding_fixture.py (Task 2)
# ---------------------------------------------------------------------------

import record_embedding_fixture as rf  # noqa: E402

REAL_EXCERPTS = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"


def _synthetic_excerpts(tmp_path, n_files=2, seconds=10):
    d = tmp_path / "excerpts"
    d.mkdir()
    for i in range(n_files):
        (d / f"site{i}_20230101_120000.wav").write_bytes(_wav_bytes(seconds=seconds, seed=20 + i))
    return d


class PerturbedClient(StubClient):
    def embed(self, windows):
        out = super().embed(windows)
        out[1, 5] += 1e-3
        return out


def _fixture_args(excerpts, out_dir, *extra):
    return ["--excerpts-dir", str(excerpts), "--out-dir", str(out_dir), *extra]


def _snapshot(directory):
    return {p.name: p.read_bytes() for p in pathlib.Path(directory).iterdir()}


def test_fixture_record_with_stub_client(tmp_path, monkeypatch):
    client = StubClient()
    monkeypatch.setattr(rf, "make_client", lambda profile: client)
    out = tmp_path / "fx"
    assert rf.main(_fixture_args(REAL_EXCERPTS, out, "--confirm")) == 0

    raw = (out / "excerpt_embeddings.f32").read_bytes()
    assert len(raw) == 54 * 1280 * 4
    doc = json.loads((out / "excerpt_embeddings.json").read_text(encoding="utf-8"))
    assert doc["count"] == 54 and doc["dim"] == 1280 and doc["dtype"] == "float32-le"
    assert doc["embeddings_sha256"] == hashlib.sha256(raw).hexdigest()
    assert doc["spec_version"] == reef_audio.SPEC_VERSION
    assert doc["tolerance"] == {"cosine_min": 0.99999, "max_abs": 1e-5}
    assert doc["inference"]["batch_size"] == 10 and "recorded_at" in doc
    assert len(doc["excerpts"]) == 9
    paths = [e["path"] for e in doc["excerpts"]]
    assert paths == sorted(paths)

    row = 0
    for e in doc["excerpts"]:
        data = (REAL_EXCERPTS / e["path"]).read_bytes()
        assert e["sha256"] == hashlib.sha256(data).hexdigest()
        prepared = reef_audio.audio_to_windows(data)
        assert len(e["windows"]) == len(prepared.windows) == 6
        for w in e["windows"]:
            assert w["row"] == row
            expected = hashlib.sha256(
                np.ascontiguousarray(prepared.windows[w["index"]], dtype="<f4").tobytes()
            ).hexdigest()
            assert w["window_sha256"] == expected
            row += 1
    assert row == 54
    assert client.warmed == 1 and client.embed_calls == [54]


def test_fixture_check_passes_and_fails_on_perturbation(tmp_path, monkeypatch, capsys):
    excerpts = _synthetic_excerpts(tmp_path)
    out = tmp_path / "fx"
    monkeypatch.setattr(rf, "make_client", lambda profile: StubClient())
    assert rf.main(_fixture_args(excerpts, out, "--confirm")) == 0
    before = _snapshot(out)

    assert rf.main(_fixture_args(excerpts, out, "--check", "--confirm")) == 0
    assert _snapshot(out) == before  # check never writes

    monkeypatch.setattr(rf, "make_client", lambda profile: PerturbedClient())
    capsys.readouterr()
    assert rf.main(_fixture_args(excerpts, out, "--check", "--confirm")) == 1
    captured = capsys.readouterr()
    text = captured.out + captured.err
    assert "min cosine" in text and "max abs" in text
    assert _snapshot(out) == before


def test_fixture_check_refuses_changed_windows(tmp_path, monkeypatch):
    excerpts = _synthetic_excerpts(tmp_path)
    out = tmp_path / "fx"
    monkeypatch.setattr(rf, "make_client", lambda profile: StubClient())
    assert rf.main(_fixture_args(excerpts, out, "--confirm")) == 0

    def boom(profile):
        raise AssertionError("inference must not be reached when the inputs changed")

    monkeypatch.setattr(rf, "make_client", boom)

    # 1. an excerpt file changed
    victim = sorted(excerpts.glob("*.wav"))[0]
    original = victim.read_bytes()
    victim.write_bytes(_wav_bytes(seconds=10, seed=99))
    assert rf.main(_fixture_args(excerpts, out, "--check", "--confirm")) == 1
    victim.write_bytes(original)
    assert rf.main(_fixture_args(excerpts, out, "--check")) == 0  # restored: offline check passes

    # 2. a recorded window hash edited in the fixture json
    path = out / "excerpt_embeddings.json"
    good = path.read_text(encoding="utf-8")
    doc = json.loads(good)
    doc["excerpts"][0]["windows"][0]["window_sha256"] = "0" * 64
    path.write_text(json.dumps(doc), encoding="utf-8")
    assert rf.main(_fixture_args(excerpts, out, "--check", "--confirm")) == 1
    path.write_text(good, encoding="utf-8")

    # 3. an excerpt added to the directory
    (excerpts / "extra_20230101_120000.wav").write_bytes(_wav_bytes(seconds=10, seed=5))
    assert rf.main(_fixture_args(excerpts, out, "--check", "--confirm")) == 1


def test_fixture_requires_confirm_for_aws(tmp_path, monkeypatch, capsys):
    excerpts = _synthetic_excerpts(tmp_path)
    out = tmp_path / "fx"

    def boom(profile):
        raise AssertionError("client factory must not be called without --confirm")

    monkeypatch.setattr(rf, "make_client", boom)
    assert rf.main(_fixture_args(excerpts, out)) == 0
    assert not out.exists() or not any(out.iterdir())
    assert "--confirm" in capsys.readouterr().out

    monkeypatch.setattr(rf, "make_client", lambda profile: StubClient())
    assert rf.main(_fixture_args(excerpts, out, "--confirm")) == 0
    monkeypatch.setattr(rf, "make_client", boom)
    assert rf.main(_fixture_args(excerpts, out, "--check")) == 0  # offline hash check only


def test_fixture_help_lists_flags(capsys):
    with pytest.raises(SystemExit) as exc:
        rf.main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "--check" in out and "--confirm" in out
