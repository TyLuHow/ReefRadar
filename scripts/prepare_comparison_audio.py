#!/usr/bin/env python3
"""
Prepare comparison audio files for the location A/B comparison feature.

Reads data/paired_audio_locations.json (from audit script),
selects WAV files per country/status, concatenates, trims to 30s,
normalizes, and outputs to dashboard-next/public/audio/compare/{country}/{status}.wav.

Uses pure Python (wave + struct) -- no ffmpeg dependency required.
Source files are already 16kHz mono 16-bit PCM (matching existing demo files).
"""

import json
import os
import random
import struct
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = REPO_ROOT / "data" / "paired_audio_locations.json"
OUTPUT_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "compare"

TARGET_SAMPLE_RATE = 16000
TARGET_CHANNELS = 1
TARGET_SAMPLE_WIDTH = 2  # 16-bit
TARGET_DURATION_SECONDS = 30
TARGET_FRAMES = TARGET_SAMPLE_RATE * TARGET_DURATION_SECONDS

# Seed for reproducibility
random.seed(42)


def read_wav_samples(filepath: str) -> list[int]:
    """Read all samples from a WAV file as list of 16-bit integers."""
    with wave.open(filepath, "r") as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

        if sample_width == 2:
            fmt = f"<{n_frames * n_channels}h"
            samples = list(struct.unpack(fmt, raw))
        elif sample_width == 1:
            samples = [((b - 128) << 8) for b in raw]
        else:
            raise ValueError(f"Unsupported sample width: {sample_width}")

        # Convert stereo to mono if needed
        if n_channels == 2:
            mono = []
            for i in range(0, len(samples), 2):
                mono.append((samples[i] + samples[i + 1]) // 2)
            samples = mono

        return samples


def normalize_samples(samples: list[int], target_peak: float = 0.9) -> list[int]:
    """Normalize audio samples to target peak level."""
    if not samples:
        return samples

    max_val = max(abs(s) for s in samples)
    if max_val == 0:
        return samples

    scale = (32767 * target_peak) / max_val
    return [max(-32768, min(32767, int(s * scale))) for s in samples]


def write_wav(filepath: Path, samples: list[int]):
    """Write samples as 16kHz mono 16-bit WAV."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(filepath), "w") as wf:
        wf.setnchannels(TARGET_CHANNELS)
        wf.setsampwidth(TARGET_SAMPLE_WIDTH)
        wf.setframerate(TARGET_SAMPLE_RATE)
        raw = struct.pack(f"<{len(samples)}h", *samples)
        wf.writeframes(raw)


def crossfade_concat(segments: list[list[int]], fade_samples: int = 800) -> list[int]:
    """Concatenate audio segments with short crossfade to avoid clicks."""
    if not segments:
        return []
    if len(segments) == 1:
        return segments[0]

    result = list(segments[0])
    for seg in segments[1:]:
        if len(result) < fade_samples or len(seg) < fade_samples:
            # Too short for crossfade, just append
            result.extend(seg)
            continue

        # Crossfade: last fade_samples of result overlap with first fade_samples of seg
        for i in range(fade_samples):
            t = i / fade_samples  # 0 -> 1
            idx = len(result) - fade_samples + i
            result[idx] = int(result[idx] * (1 - t) + seg[i] * t)

        result.extend(seg[fade_samples:])

    return result


def main():
    if not INPUT_PATH.exists():
        print(f"ERROR: Input not found: {INPUT_PATH}")
        print("Run audit_paired_locations.py first.")
        return

    with open(INPUT_PATH) as f:
        data = json.load(f)

    created_files = []
    errors = []

    for location in data["locations"]:
        country_id = location["id"]
        country_name = location["name"]
        print(f"\n{'='*60}")
        print(f"Processing {country_name} ({country_id})")
        print(f"{'='*60}")

        for status_name, sites in location["sites_detail"].items():
            print(f"\n  Status: {status_name}")

            # Selection strategy: pick the site with the most WAV files
            best_site = max(sites.keys(), key=lambda s: sites[s]["wav_count"])
            best_files = sites[best_site]["files"]
            print(f"    Best site: {best_site} ({len(best_files)} files)")

            # Select 3-5 WAV files randomly from best site
            n_select = min(5, max(3, len(best_files)))
            selected = random.sample(best_files, min(n_select, len(best_files)))
            print(f"    Selected {len(selected)} files")

            # Read and concatenate
            try:
                segments = []
                for fpath in selected:
                    samples = read_wav_samples(fpath)
                    segments.append(samples)
                    print(f"      Read {len(samples)} samples from {os.path.basename(fpath)}")

                # Concatenate with crossfade
                combined = crossfade_concat(segments)
                print(f"    Combined: {len(combined)} samples ({len(combined)/TARGET_SAMPLE_RATE:.1f}s)")

                # Trim to 30 seconds
                if len(combined) > TARGET_FRAMES:
                    combined = combined[:TARGET_FRAMES]
                elif len(combined) < TARGET_FRAMES:
                    # If shorter, loop to fill 30s
                    original = list(combined)
                    while len(combined) < TARGET_FRAMES:
                        remaining = TARGET_FRAMES - len(combined)
                        combined.extend(original[:remaining])
                    combined = combined[:TARGET_FRAMES]

                # Normalize
                combined = normalize_samples(combined, target_peak=0.85)

                # Write output
                output_path = OUTPUT_DIR / country_id / f"{status_name}.wav"
                write_wav(output_path, combined)
                duration = len(combined) / TARGET_SAMPLE_RATE
                size_kb = output_path.stat().st_size / 1024
                print(f"    Output: {output_path.relative_to(REPO_ROOT)} ({duration:.1f}s, {size_kb:.0f} KB)")
                created_files.append(str(output_path.relative_to(REPO_ROOT)))

            except Exception as e:
                error_msg = f"Failed to process {country_id}/{status_name}: {e}"
                print(f"    ERROR: {error_msg}")
                errors.append(error_msg)

    print(f"\n{'='*60}")
    print(f"Summary: Created {len(created_files)} audio files")
    if errors:
        print(f"Errors: {len(errors)}")
        for err in errors:
            print(f"  - {err}")

    for f in created_files:
        print(f"  {f}")


if __name__ == "__main__":
    main()
