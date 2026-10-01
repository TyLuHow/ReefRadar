#!/usr/bin/env python3
"""
Spectral sanity check that flags synthetic tone-mix clips and passes real
reef recordings (TRUTH-03).

Flags a clip when ANY of:
  - sample_rate != 16000 Hz (MARRS native rate; the previously-served
    synthetic demo clips were generated at 32 kHz)
  - spectral_flatness < 0.1 over 50 Hz-Nyquist (tonal, not broadband)
  - more than 50% of in-band energy sits in the 50 loudest FFT bins
    (concentrated tones rather than a natural soundscape)

Computation is numpy-only: a hand-rolled Welch-averaged power spectrum
(nfft=4096, Hann window, 50% overlap).

Usage:
    py -3.12 scripts/check_audio_real.py --self-test
    py -3.12 scripts/check_audio_real.py dashboard-next/public/audio/marrs
    py -3.12 scripts/check_audio_real.py --from-live-samples

Exit code: 1 if any checked input is flagged, 0 otherwise (same rule in
every mode -- in --from-live-samples mode a 1 is the EXPECTED, correct
result, since the currently-served clips are synthetic).
"""

import argparse
import io
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

LIVE_SAMPLES_URL = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/samples"

NFFT = 4096
OVERLAP = 0.5
MIN_FREQ_HZ = 50.0
FLATNESS_THRESHOLD = 0.1
TOP_N_BINS = 50
TOP_N_FRACTION_THRESHOLD = 0.5
NATIVE_SAMPLE_RATE_HZ = 16000


def read_wav_mono(source):
    """source: filename/Path or a file-like object (e.g. io.BytesIO)."""
    with wave.open(source, "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)

    if sampwidth == 2:
        data = np.frombuffer(raw, dtype="<i2").astype(np.float64)
    elif sampwidth == 1:
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0) * 256.0
    else:
        raise ValueError(f"Unsupported sample width: {sampwidth * 8}-bit")

    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)

    duration_s = (len(data) / framerate) if framerate else 0.0
    return data, framerate, duration_s


def welch_psd(signal, sr, nfft=NFFT, overlap=OVERLAP):
    hop = max(1, int(nfft * (1 - overlap)))
    window = np.hanning(nfft)
    win_norm = float(np.sum(window ** 2))

    n = len(signal)
    if n < nfft:
        segment = np.zeros(nfft)
        segment[:n] = signal
        segments = [segment]
    else:
        starts = range(0, n - nfft + 1, hop)
        segments = [signal[s : s + nfft] for s in starts]

    psd_acc = np.zeros(nfft // 2 + 1)
    for seg in segments:
        windowed = seg * window
        spec = np.fft.rfft(windowed)
        psd_acc += (np.abs(spec) ** 2) / win_norm

    psd_avg = psd_acc / len(segments)
    freqs = np.fft.rfftfreq(nfft, d=1.0 / sr)
    return freqs, psd_avg


def check_file(source):
    """
    source: filename/Path or file-like object.
    Returns dict: sample_rate, duration_s, spectral_flatness,
    top50_bin_energy_fraction, rms_dbfs, flagged, reasons.
    """
    data, sr, duration_s = read_wav_mono(source)

    rms = float(np.sqrt(np.mean(data ** 2))) if data.size else 0.0
    rms_dbfs = 20.0 * np.log10(rms / 32768.0) if rms > 0 else -120.0

    freqs, psd = welch_psd(data, sr)
    band_mask = freqs >= MIN_FREQ_HZ
    psd_band = psd[band_mask]

    eps = 1e-20
    psd_band_safe = np.maximum(psd_band, eps)
    geo_mean = float(np.exp(np.mean(np.log(psd_band_safe))))
    arith_mean = float(np.mean(psd_band_safe))
    spectral_flatness = (geo_mean / arith_mean) if arith_mean > 0 else 0.0

    total_energy = float(np.sum(psd_band))
    if total_energy > 0 and psd_band.size > 0:
        n_top = min(TOP_N_BINS, psd_band.size)
        top_bins = np.sort(psd_band)[-n_top:]
        top_fraction = float(np.sum(top_bins) / total_energy)
    else:
        top_fraction = 0.0

    reasons = []
    if sr != NATIVE_SAMPLE_RATE_HZ:
        reasons.append(f"sample_rate {sr} Hz != {NATIVE_SAMPLE_RATE_HZ} Hz (MARRS native rate)")
    if spectral_flatness < FLATNESS_THRESHOLD:
        reasons.append(f"spectral_flatness {spectral_flatness:.4f} < {FLATNESS_THRESHOLD} (tonal)")
    if top_fraction > TOP_N_FRACTION_THRESHOLD:
        reasons.append(
            f"top{TOP_N_BINS}_bin_energy_fraction {top_fraction:.4f} > {TOP_N_FRACTION_THRESHOLD} "
            "(energy concentrated in a few bins)"
        )

    return {
        "sample_rate": sr,
        "duration_s": round(duration_s, 3),
        "spectral_flatness": round(spectral_flatness, 4),
        "top50_bin_energy_fraction": round(top_fraction, 4),
        "rms_dbfs": round(rms_dbfs, 2),
        "flagged": len(reasons) > 0,
        "reasons": reasons,
    }


def collect_wav_files(paths):
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            found = sorted(set(path.glob("*.wav")) | set(path.glob("*.WAV")))
            files.extend(found)
        elif path.is_file():
            files.append(path)
        else:
            print(f"WARNING: path not found: {p}", file=sys.stderr)
    return files


def run_self_test():
    sr = 32000
    duration = 5.0
    t = np.arange(int(sr * duration)) / sr
    tones_hz = (200, 500, 1000)
    signal = sum(np.sin(2 * np.pi * f * t) for f in tones_hz) / len(tones_hz)
    signal_int16 = np.clip(signal * 32767 * 0.9, -32768, 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(signal_int16.tobytes())
    buf.seek(0)

    result = check_file(buf)
    if result["flagged"]:
        print(f"SELF-TEST PASSED: synthetic {tones_hz} Hz tone mix at {sr} Hz correctly flagged")
        for reason in result["reasons"]:
            print(f"    - {reason}")
        return 0

    print(f"SELF-TEST FAILED: synthetic tone mix was NOT flagged: {result}", file=sys.stderr)
    return 1


def run_live_samples_check():
    import requests

    resp = requests.get(LIVE_SAMPLES_URL, timeout=30)
    resp.raise_for_status()
    samples = resp.json().get("samples", [])
    if not samples:
        print("No samples returned from the live /samples endpoint", file=sys.stderr)
        return 2

    any_flagged = False
    tmpdir = Path(tempfile.gettempdir())
    for s in samples:
        sample_id = s.get("id", "<unknown>")
        site_id = s.get("site_id", "<unknown>")
        audio_url = s.get("audio_url")
        if not audio_url:
            print(f"SKIP {sample_id} ({site_id}): no audio_url")
            continue

        # Downloaded outside the repo, deleted immediately after checking --
        # presigned URLs (bearer tokens) are never written to the repo or logged.
        tmp_path = tmpdir / f"reefradar_check_{sample_id}.wav"
        try:
            r = requests.get(audio_url, timeout=60)
            r.raise_for_status()
            tmp_path.write_bytes(r.content)
            result = check_file(str(tmp_path))
            status = "FLAGGED" if result["flagged"] else "OK"
            print(
                f"{status} {sample_id} ({site_id}): sample_rate={result['sample_rate']} "
                f"spectral_flatness={result['spectral_flatness']} "
                f"top50_bin_energy_fraction={result['top50_bin_energy_fraction']} "
                f"rms_dbfs={result['rms_dbfs']}"
            )
            for reason in result["reasons"]:
                print(f"    - {reason}")
            if result["flagged"]:
                any_flagged = True
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    return 1 if any_flagged else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="*", help="WAV files or directories to check")
    parser.add_argument("--self-test", action="store_true", help="Run the in-memory synthetic-tone self-test")
    parser.add_argument(
        "--from-live-samples",
        action="store_true",
        help="Download and check the clips currently served by GET /samples (negative control)",
    )
    args = parser.parse_args()

    if args.self_test:
        return run_self_test()

    if args.from_live_samples:
        return run_live_samples_check()

    if not args.paths:
        print("ERROR: provide one or more WAV files/directories, or use --self-test / --from-live-samples", file=sys.stderr)
        return 2

    files = collect_wav_files(args.paths)
    if not files:
        print("ERROR: no WAV files found at the given path(s)", file=sys.stderr)
        return 2

    any_flagged = False
    for f in files:
        result = check_file(str(f))
        status = "FLAGGED" if result["flagged"] else "OK"
        print(
            f"{status} {f}: sample_rate={result['sample_rate']} duration_s={result['duration_s']} "
            f"spectral_flatness={result['spectral_flatness']} "
            f"top50_bin_energy_fraction={result['top50_bin_energy_fraction']} "
            f"rms_dbfs={result['rms_dbfs']}"
        )
        for reason in result["reasons"]:
            print(f"    - {reason}")
        if result["flagged"]:
            any_flagged = True

    return 1 if any_flagged else 0


if __name__ == "__main__":
    sys.exit(main())
