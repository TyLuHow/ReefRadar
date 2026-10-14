"""
Tests for scripts/verify_live_embeddings.py (plan 05-15, ML-01 / ML-06).

S3 is moto; nothing touches real AWS. The "live" embeddings are the recorded fixture rows of
the ind_H1 excerpt (match), a perturbed copy (tolerance miss) or a short copy (count mismatch).
"""

import json
import pathlib
import re
import shutil

import boto3
import numpy as np
import pytest
from moto import mock_aws

import verify_live_embeddings as vle

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "lambdas" / "preprocessor" / "tests" / "fixtures"
EXCERPT = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs" / "ind_H1_20220830_120000.wav"
BUCKET = "reefradar-2477-audio"
ANALYSIS_ID = "7d3f0a52-1c4e-4b6a-9f21-0e5a8c3d7b19"
KEY = f"processed/{ANALYSIS_ID}/embeddings.f32"


def _ind_h1_rows():
    doc = json.loads((FIXTURES / "excerpt_embeddings.json").read_text(encoding="utf-8"))
    entry = next(e for e in doc["excerpts"] if e["path"] == EXCERPT.name)
    first, last = entry["windows"][0]["row"], entry["windows"][-1]["row"]
    matrix = np.fromfile(FIXTURES / "excerpt_embeddings.f32", dtype="<f4").reshape(54, 1280)
    return matrix[first:last + 1].copy()


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


def _put(s3, rows, key=KEY):
    s3.put_object(Bucket=BUCKET, Key=key, Body=np.ascontiguousarray(rows, dtype="<f4").tobytes())


def _run(s3, *extra, analysis_id=ANALYSIS_ID, excerpt=EXCERPT):
    argv = ["--analysis-id", analysis_id, "--excerpt", str(excerpt), "--confirm", *extra]
    return vle.main(argv, s3_client=s3)


def test_live_embeddings_match_passes(s3, capsys):
    _put(s3, _ind_h1_rows())
    assert _run(s3) == 0
    out = capsys.readouterr().out
    assert "PASS" in out
    assert "6 live rows" in out and "6 fixture rows" in out
    assert "min cosine" in out and "max abs" in out


def test_live_embeddings_within_tolerance_noise_passes(s3):
    rows = _ind_h1_rows()
    rows[2, 5] += 5e-6  # below the fixture's 1e-5 max abs bound
    _put(s3, rows)
    assert _run(s3) == 0


def test_live_embeddings_perturbed_fails(s3, capsys):
    rows = _ind_h1_rows()
    rows[3, 10] += 1e-3
    _put(s3, rows)
    assert _run(s3) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out and "window 3" in out


def test_live_embeddings_wrong_order_fails(s3):
    _put(s3, _ind_h1_rows()[::-1])
    assert _run(s3) == 1


def test_live_embeddings_count_mismatch_fails(s3, capsys):
    _put(s3, _ind_h1_rows()[:5])
    assert _run(s3) == 1
    assert "5 live rows" in capsys.readouterr().out


def test_live_embeddings_truncated_object_fails(s3):
    s3.put_object(Bucket=BUCKET, Key=KEY, Body=_ind_h1_rows().astype("<f4").tobytes()[:-4])
    assert _run(s3) == 1


def test_live_embeddings_non_finite_fails(s3):
    rows = _ind_h1_rows()
    rows[0, 0] = np.nan
    _put(s3, rows)
    assert _run(s3) == 1


def test_live_embeddings_missing_object_fails(s3, capsys):
    assert _run(s3) == 1
    out = capsys.readouterr().out
    assert "NoSuchKey" in out


def test_live_embeddings_requires_confirm(monkeypatch):
    class NoCalls:
        def __getattr__(self, name):
            raise AssertionError(f"AWS client used without --confirm: {name}")

    code = vle.main(["--analysis-id", ANALYSIS_ID, "--excerpt", str(EXCERPT)], s3_client=NoCalls())
    assert code == 0

    def boom(*a, **kw):
        raise AssertionError("a session was opened without --confirm")

    monkeypatch.setattr(vle.surfperch_client, "aws_session", boom)
    assert vle.main(["--analysis-id", ANALYSIS_ID, "--excerpt", str(EXCERPT)]) == 0


def test_without_confirm_says_nothing_was_verified(capsys):
    assert vle.main(["--analysis-id", ANALYSIS_ID, "--excerpt", str(EXCERPT)]) == 0
    out = capsys.readouterr().out
    assert "NOT VERIFIED" in out and "no AWS call" in out


def test_excerpt_hash_must_match_the_fixture(s3, tmp_path):
    _put(s3, _ind_h1_rows())
    altered = tmp_path / EXCERPT.name
    shutil.copyfile(EXCERPT, altered)
    with open(altered, "r+b") as f:
        f.seek(-1, 2)
        last = f.read(1)
        f.seek(-1, 2)
        f.write(bytes([last[0] ^ 0xFF]))
    assert _run(s3, excerpt=altered) == 1


def test_excerpt_hash_is_checked_even_without_confirm(tmp_path):
    altered = tmp_path / EXCERPT.name
    shutil.copyfile(EXCERPT, altered)
    altered.write_bytes(altered.read_bytes() + b"\0\0")
    assert vle.main(["--analysis-id", ANALYSIS_ID, "--excerpt", str(altered)]) == 1


def test_unknown_excerpt_fails(s3, tmp_path):
    other = tmp_path / "not_in_fixture.wav"
    other.write_bytes(b"RIFF")
    assert _run(s3, excerpt=other) == 1


@pytest.mark.parametrize(
    "bad_id",
    ["../../etc/passwd", "analysis-1", ANALYSIS_ID + "/../x", ANALYSIS_ID.upper() + "x", "", "7d3f0a52-1c4e-4b6a-9f21"],
)
def test_analysis_id_must_be_a_uuid(s3, bad_id):
    assert _run(s3, analysis_id=bad_id) == 1


def test_fixture_integrity_is_checked(s3, tmp_path):
    fixture_dir = tmp_path / "fixtures"
    shutil.copytree(FIXTURES, fixture_dir)
    raw = bytearray((fixture_dir / "excerpt_embeddings.f32").read_bytes())
    raw[0] ^= 0xFF
    (fixture_dir / "excerpt_embeddings.f32").write_bytes(bytes(raw))
    _put(s3, _ind_h1_rows())
    assert _run(s3, "--fixture-dir", str(fixture_dir)) == 1


def test_reads_only_the_analysis_embeddings_key(s3):
    seen = []
    real_get = s3.get_object

    def spy(**kwargs):
        seen.append((kwargs["Bucket"], kwargs["Key"]))
        return real_get(**kwargs)

    s3.get_object = spy
    _put(s3, _ind_h1_rows())
    assert _run(s3) == 0
    assert seen == [(BUCKET, KEY)]


def test_output_never_contains_object_bodies_or_urls(s3, capsys):
    rows = _ind_h1_rows()
    _put(s3, rows)
    _run(s3)
    out = capsys.readouterr().out
    assert not re.search(r"https?://", out)
    assert repr(float(rows[0, 0])) not in out


def test_wrong_account_refuses_to_run(monkeypatch):
    class Sts:
        def get_caller_identity(self):
            return {"Account": "000000000000"}

    class Session:
        def client(self, name, **kw):
            assert name == "sts", "no other client may be built before the account check"
            return Sts()

    monkeypatch.setattr(vle.surfperch_client, "aws_session", lambda *a, **kw: Session())
    code = vle.main(["--analysis-id", ANALYSIS_ID, "--excerpt", str(EXCERPT), "--confirm"])
    assert code == 1


def test_help_lists_the_options(capsys):
    with pytest.raises(SystemExit):
        vle.main(["--help"])
    out = capsys.readouterr().out
    for option in ("--analysis-id", "--excerpt", "--fixture-dir", "--bucket", "--profile", "--confirm"):
        assert option in out
