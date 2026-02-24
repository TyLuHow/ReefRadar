#!/usr/bin/env python3
"""
prepare_demo_audio.py

Selects acoustically distinct MARRS coral reef recordings and produces two
~15-second demo WAV files for the Next.js dashboard audio comparison feature.

Selection based on AUDIO_DIAGNOSIS.md recommendations:
  - Healthy:  mex_H1_20230627_171200.WAV  (dusk chorus, 81% low-freq, highest fish power)
  - Degraded: mal_D2_20211115_110800.WAV  (midday, quietest file in dataset)

The pair yields a ~53x spectral power contrast vs the previous pair which was
inverted (degraded louder than healthy).

Outputs:
    dashboard-next/public/audio/healthy-reef.wav
    dashboard-next/public/audio/degraded-reef.wav
    dashboard-next/public/audio/ATTRIBUTION.md

Requirements: scipy, numpy (for proper normalization and WAV I/O)
"""

import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

# Paths
ROOT = Path(__file__).resolve().parent.parent
MARRS_DIR = ROOT / "data" / "marrs" / "samples"
OUTPUT_DIR = ROOT / "dashboard-next" / "public" / "audio"

# Target duration in seconds
TARGET_DURATION = 15.0

# Source files (from AUDIO_DIAGNOSIS.md Section 3.5 - Maximum Contrast Pair)
HEALTHY_SOURCE = MARRS_DIR / "mex_H1" / "mex_H1_20230627_171200.WAV"
DEGRADED_SOURCE = MARRS_DIR / "mal_D2" / "mal_D2_20211115_110800.WAV"

# Fallback candidates if primary files are unavailable
HEALTHY_FALLBACKS = [
    MARRS_DIR / "aus_H1" / "aus_H1_20230302_170400.WAV",
    MARRS_DIR / "mex_H2" / "mex_H2_20230529_070400.WAV" if (MARRS_DIR / "mex_H2").is_dir() else None,
    MARRS_DIR / "ind_H3" / "ind_H3_20220918_053800.WAV" if (MARRS_DIR / "ind_H3").is_dir() else None,
]

DEGRADED_FALLBACKS = [
    MARRS_DIR / "ind_D6" / "ind_D6_20220920_143000.WAV" if (MARRS_DIR / "ind_D6").is_dir() else None,
    MARRS_DIR / "ind_D4" / "ind_D4_20220913_111000.WAV",
    MARRS_DIR / "ind_D1" / "ind_D1_20220915_113800.WAV" if (MARRS_DIR / "ind_D1").is_dir() else None,
]


def find_source(primary: Path, fallbacks: list) -> Path:
    """Return primary source if it exists, otherwise try fallbacks."""
    if primary.exists():
        return primary
    print(f"  Warning: Primary source not found: {primary}")
    for fb in fallbacks:
        if fb is not None and fb.exists():
            print(f"  Using fallback: {fb}")
            return fb
    raise FileNotFoundError(f"No source files found (primary or fallbacks)")


def trim_and_normalize(source_path: Path, target_seconds: float) -> tuple:
    """
    Read a WAV file, trim to target duration, and peak-normalize.
    Returns (sample_rate, normalized_data_int16).
    """
    sr, data = wavfile.read(str(source_path))

    # Convert to float64 for processing
    if data.dtype == np.int16:
        audio = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        audio = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.float32 or data.dtype == np.float64:
        audio = data.astype(np.float64)
    else:
        audio = data.astype(np.float64) / np.iinfo(data.dtype).max

    # Convert stereo to mono if needed
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    # Trim to target duration
    target_samples = int(target_seconds * sr)
    if len(audio) > target_samples:
        audio = audio[:target_samples]
    elif len(audio) < target_samples:
        print(f"  Warning: source only {len(audio)/sr:.1f}s, padding to {target_seconds}s")
        audio = np.pad(audio, (0, target_samples - len(audio)))

    # Peak normalize to 0.95 (leaves a tiny bit of headroom)
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio * (0.95 / peak)

    # Convert back to int16
    audio_int16 = np.clip(audio * 32767, -32768, 32767).astype(np.int16)

    return sr, audio_int16


def compute_stats(audio_int16: np.ndarray, sr: int) -> dict:
    """Compute basic spectral stats for verification."""
    audio = audio_int16.astype(np.float64) / 32768.0
    rms = np.sqrt(np.mean(audio ** 2))
    peak = np.max(np.abs(audio))

    # FFT for band analysis
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(len(audio), 1.0 / sr)
    power = np.abs(fft) ** 2

    total_power = np.sum(power)
    low_mask = freqs < 800
    mid_mask = (freqs >= 800) & (freqs < 3000)
    high_mask = freqs >= 3000

    low_pct = np.sum(power[low_mask]) / total_power * 100 if total_power > 0 else 0
    mid_pct = np.sum(power[mid_mask]) / total_power * 100 if total_power > 0 else 0
    high_pct = np.sum(power[high_mask]) / total_power * 100 if total_power > 0 else 0

    return {
        'rms': rms,
        'peak': peak,
        'total_power': total_power,
        'low_pct': low_pct,
        'mid_pct': mid_pct,
        'high_pct': high_pct,
    }


def create_attribution(output_dir: Path, healthy_src: Path, degraded_src: Path) -> None:
    """Create ATTRIBUTION.md with MARRS dataset citation."""
    h_name = healthy_src.stem
    d_name = degraded_src.stem
    # Extract site from filename (e.g., mex_H1 from mex_H1_20230627_171200)
    h_site = '_'.join(h_name.split('_')[:2])
    d_site = '_'.join(d_name.split('_')[:2])

    content = f"""# Audio Attribution

## MARRS Coral Reef Acoustic Dataset

The demo audio files in this directory are excerpts from the MARRS
(Mars Assisted Reef Restoration System) coral reef acoustic dataset.

**Citation:**
Williams, B., Maynes, T., Sherwood, O., et al. (2024).
Coral reef acoustic recordings from the MARRS restoration project.
UCL Figshare. DOI: 10.5522/04/29958062

**License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

**Files:**
- `healthy-reef.wav` -- 15s excerpt from {h_name}.WAV ({h_site}, dusk chorus)
- `degraded-reef.wav` -- 15s excerpt from {d_name}.WAV ({d_site}, midday)

**Processing:**
- Trimmed to 15 seconds
- Peak-normalized to 0.95 for matched playback levels
- Sample rate: 16,000 Hz (original)
- Channels: Mono
"""
    output_path = output_dir / "ATTRIBUTION.md"
    output_path.write_text(content)
    print(f"  Created {output_path}")


def main() -> None:
    print("=== ReefRadar Demo Audio Preparation ===\n")

    # Verify MARRS samples exist
    if not MARRS_DIR.exists():
        print(f"ERROR: MARRS samples directory not found: {MARRS_DIR}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # --- Find sources ---
    print("1. Selecting source files...")
    healthy_src = find_source(HEALTHY_SOURCE, HEALTHY_FALLBACKS)
    degraded_src = find_source(DEGRADED_SOURCE, DEGRADED_FALLBACKS)
    print(f"  Healthy:  {healthy_src.name}")
    print(f"  Degraded: {degraded_src.name}\n")

    # --- Process healthy ---
    print("2. Processing healthy reef audio...")
    h_sr, h_audio = trim_and_normalize(healthy_src, TARGET_DURATION)
    healthy_path = OUTPUT_DIR / "healthy-reef.wav"
    wavfile.write(str(healthy_path), h_sr, h_audio)
    h_stats = compute_stats(h_audio, h_sr)
    size_kb = healthy_path.stat().st_size / 1024
    print(f"  Output: {healthy_path}")
    print(f"  Duration: {len(h_audio)/h_sr:.1f}s, Size: {size_kb:.0f} KB, Rate: {h_sr} Hz")
    print(f"  RMS: {h_stats['rms']:.6f}, Peak: {h_stats['peak']:.4f}")
    print(f"  Bands: Low {h_stats['low_pct']:.1f}% | Mid {h_stats['mid_pct']:.1f}% | High {h_stats['high_pct']:.1f}%\n")

    # --- Process degraded ---
    print("3. Processing degraded reef audio...")
    d_sr, d_audio = trim_and_normalize(degraded_src, TARGET_DURATION)
    degraded_path = OUTPUT_DIR / "degraded-reef.wav"
    wavfile.write(str(degraded_path), d_sr, d_audio)
    d_stats = compute_stats(d_audio, d_sr)
    size_kb = degraded_path.stat().st_size / 1024
    print(f"  Output: {degraded_path}")
    print(f"  Duration: {len(d_audio)/d_sr:.1f}s, Size: {size_kb:.0f} KB, Rate: {d_sr} Hz")
    print(f"  RMS: {d_stats['rms']:.6f}, Peak: {d_stats['peak']:.4f}")
    print(f"  Bands: Low {d_stats['low_pct']:.1f}% | Mid {d_stats['mid_pct']:.1f}% | High {d_stats['high_pct']:.1f}%\n")

    # --- Contrast comparison ---
    print("4. Contrast analysis...")
    if d_stats['total_power'] > 0:
        ratio = h_stats['total_power'] / d_stats['total_power']
        print(f"  Power ratio (healthy/degraded): {ratio:.1f}x")
    else:
        print("  Power ratio: degraded has zero power")
    print(f"  Low band:  healthy {h_stats['low_pct']:.1f}% vs degraded {d_stats['low_pct']:.1f}%")
    print(f"  Mid band:  healthy {h_stats['mid_pct']:.1f}% vs degraded {d_stats['mid_pct']:.1f}%")
    print(f"  High band: healthy {h_stats['high_pct']:.1f}% vs degraded {d_stats['high_pct']:.1f}%\n")

    # --- Attribution ---
    print("5. Creating attribution file...")
    create_attribution(OUTPUT_DIR, healthy_src, degraded_src)

    print("\nDone! Demo audio files are ready for the Next.js dashboard.")


if __name__ == "__main__":
    main()
