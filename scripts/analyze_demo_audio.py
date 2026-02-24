#!/usr/bin/env python3
"""
Analyze demo audio files and MARRS samples for ReefRadar dashboard diagnosis.

Compares spectral content between healthy and degraded reef recordings to
determine if they have sufficient acoustic contrast for the demo experience.
"""

import os
import sys
import glob
import re
import numpy as np
from scipy.io import wavfile
from scipy import signal


def analyze_audio(filepath):
    """Analyze a WAV file and return spectral characteristics."""
    try:
        sample_rate, data = wavfile.read(filepath)
    except Exception as e:
        return {'error': str(e), 'filepath': filepath}

    # Convert to float64 and handle stereo
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.float32 or data.dtype == np.float64:
        data = data.astype(np.float64)
    else:
        data = data.astype(np.float64)

    if len(data.shape) > 1:
        data = data.mean(axis=1)

    # Normalize
    peak = np.max(np.abs(data))
    if peak > 0:
        data_norm = data / peak
    else:
        data_norm = data

    # Compute spectrogram
    nperseg = min(2048, len(data_norm))
    noverlap = nperseg // 2
    frequencies, times, spec = signal.spectrogram(
        data_norm, sample_rate, nperseg=nperseg, noverlap=noverlap
    )

    nyquist = sample_rate / 2.0

    # Define frequency bands
    low_mask = frequencies < 1000
    mid_mask = (frequencies >= 1000) & (frequencies < 4000)
    high_mask = frequencies >= 4000

    low_power = np.mean(spec[low_mask, :]) if np.any(low_mask) else 0
    mid_power = np.mean(spec[mid_mask, :]) if np.any(mid_mask) else 0
    high_power = np.mean(spec[high_mask, :]) if np.any(high_mask) else 0
    total_mean = low_power + mid_power + high_power

    # Also compute total power (sum, not mean)
    total_power = np.sum(spec)

    # RMS power of the raw signal
    rms = np.sqrt(np.mean(data ** 2))

    # Peak frequency (frequency with highest average power)
    avg_power_per_freq = np.mean(spec, axis=1)
    peak_freq_idx = np.argmax(avg_power_per_freq)
    peak_freq = frequencies[peak_freq_idx]

    # Power in specific ecological bands
    # Fish calls: 50-1000 Hz
    fish_mask = (frequencies >= 50) & (frequencies < 1000)
    # Grazing: 1000-4000 Hz
    grazing_mask = (frequencies >= 1000) & (frequencies < 4000)
    # Snapping shrimp: 2000-8000 Hz (broader than just >4kHz)
    shrimp_mask = (frequencies >= 2000) & (frequencies < 8000)

    fish_power = np.mean(spec[fish_mask, :]) if np.any(fish_mask) else 0
    grazing_power = np.mean(spec[grazing_mask, :]) if np.any(grazing_mask) else 0
    shrimp_power = np.mean(spec[shrimp_mask, :]) if np.any(shrimp_mask) else 0

    return {
        'filepath': filepath,
        'filename': os.path.basename(filepath),
        'sample_rate': sample_rate,
        'duration': len(data) / sample_rate,
        'channels': 1,
        'nyquist': nyquist,
        'samples': len(data),
        'rms': rms,
        'peak_amplitude': peak,
        'low_pct': (low_power / total_mean * 100) if total_mean > 0 else 0,
        'mid_pct': (mid_power / total_mean * 100) if total_mean > 0 else 0,
        'high_pct': (high_power / total_mean * 100) if total_mean > 0 else 0,
        'total_power': total_power,
        'total_mean_power': total_mean,
        'peak_frequency': peak_freq,
        'fish_power': fish_power,
        'grazing_power': grazing_power,
        'shrimp_power': shrimp_power,
        'low_power_abs': low_power,
        'mid_power_abs': mid_power,
        'high_power_abs': high_power,
    }


def extract_time_from_filename(filename):
    """Extract hour from MARRS filename like ind_H4_20220903_053000.WAV"""
    match = re.search(r'_(\d{6})\.WAV$', filename, re.IGNORECASE)
    if match:
        time_str = match.group(1)
        return int(time_str[:2])
    return None


def print_analysis(result, label=""):
    """Pretty-print analysis results."""
    if 'error' in result:
        print(f"  ERROR: {result['error']}")
        return

    if label:
        print(f"\n{'='*70}")
        print(f"  {label}")
        print(f"{'='*70}")

    print(f"  File: {result['filename']}")
    print(f"  Sample Rate: {result['sample_rate']} Hz")
    print(f"  Duration: {result['duration']:.2f}s")
    print(f"  Nyquist: {result['nyquist']:.0f} Hz")
    print(f"  Samples: {result['samples']:,}")
    print(f"  RMS Power: {result['rms']:.6f}")
    print(f"  Peak Amplitude: {result['peak_amplitude']:.4f}")
    print(f"  Peak Frequency: {result['peak_frequency']:.1f} Hz")
    print()
    print(f"  Band Distribution:")
    print(f"    Low  (<1kHz):   {result['low_pct']:6.1f}%  (abs: {result['low_power_abs']:.8f})")
    print(f"    Mid  (1-4kHz):  {result['mid_pct']:6.1f}%  (abs: {result['mid_power_abs']:.8f})")
    print(f"    High (>4kHz):   {result['high_pct']:6.1f}%  (abs: {result['high_power_abs']:.8f})")
    print(f"  Total Mean Power: {result['total_mean_power']:.8f}")
    print(f"  Total Sum Power:  {result['total_power']:.4f}")
    print()
    print(f"  Ecological Bands:")
    print(f"    Fish (50-1kHz):     {result['fish_power']:.8f}")
    print(f"    Grazing (1-4kHz):   {result['grazing_power']:.8f}")
    print(f"    Shrimp (2-8kHz):    {result['shrimp_power']:.8f}")


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # ========================================================================
    # Part 1: Analyze demo WAV files
    # ========================================================================
    print("\n" + "=" * 70)
    print("  PART 1: DEMO AUDIO FILE ANALYSIS")
    print("=" * 70)

    healthy_path = os.path.join(base_dir, 'dashboard-next', 'public', 'audio', 'healthy-reef.wav')
    degraded_path = os.path.join(base_dir, 'dashboard-next', 'public', 'audio', 'degraded-reef.wav')

    healthy = analyze_audio(healthy_path)
    degraded = analyze_audio(degraded_path)

    print_analysis(healthy, "HEALTHY DEMO (healthy-reef.wav)")
    print_analysis(degraded, "DEGRADED DEMO (degraded-reef.wav)")

    # Comparison
    if 'error' not in healthy and 'error' not in degraded:
        print(f"\n{'='*70}")
        print(f"  COMPARISON: HEALTHY vs DEGRADED")
        print(f"{'='*70}")
        print(f"  RMS ratio (healthy/degraded): {healthy['rms']/degraded['rms']:.2f}x")
        print(f"  Total power ratio:            {healthy['total_power']/degraded['total_power']:.2f}x")
        print(f"  Fish power ratio:             {healthy['fish_power']/degraded['fish_power']:.2f}x" if degraded['fish_power'] > 0 else "  Fish power ratio: degraded=0")
        print(f"  Grazing power ratio:          {healthy['grazing_power']/degraded['grazing_power']:.2f}x" if degraded['grazing_power'] > 0 else "  Grazing power ratio: degraded=0")
        print(f"  Shrimp power ratio:           {healthy['shrimp_power']/degraded['shrimp_power']:.2f}x" if degraded['shrimp_power'] > 0 else "  Shrimp power ratio: degraded=0")

        print(f"\n  Band distribution delta:")
        print(f"    Low:  H={healthy['low_pct']:.1f}%  D={degraded['low_pct']:.1f}%  delta={healthy['low_pct']-degraded['low_pct']:+.1f}%")
        print(f"    Mid:  H={healthy['mid_pct']:.1f}%  D={degraded['mid_pct']:.1f}%  delta={healthy['mid_pct']-degraded['mid_pct']:+.1f}%")
        print(f"    High: H={healthy['high_pct']:.1f}%  D={degraded['high_pct']:.1f}%  delta={healthy['high_pct']-degraded['high_pct']:+.1f}%")

    # ========================================================================
    # Part 2: Analyze MARRS samples
    # ========================================================================
    print(f"\n\n{'='*70}")
    print(f"  PART 2: MARRS SAMPLE SURVEY")
    print(f"{'='*70}")

    marrs_dir = os.path.join(base_dir, 'data', 'marrs', 'samples')
    if not os.path.isdir(marrs_dir):
        print(f"  MARRS samples directory not found: {marrs_dir}")
        return

    # Find all WAV files
    all_wavs = glob.glob(os.path.join(marrs_dir, '*', '*.WAV'))
    print(f"\n  Found {len(all_wavs)} MARRS WAV files")

    # Categorize files
    healthy_dawn_dusk = []  # H sites, hours 05-07 or 17-19
    degraded_midday = []    # D sites, hours 10-14
    all_healthy = []        # All H site files
    all_degraded = []       # All D site files

    for wav_path in all_wavs:
        filename = os.path.basename(wav_path)
        dirname = os.path.basename(os.path.dirname(wav_path))
        hour = extract_time_from_filename(filename)

        if '_H' in dirname:
            all_healthy.append(wav_path)
            if hour is not None and (5 <= hour <= 7 or 17 <= hour <= 19):
                healthy_dawn_dusk.append(wav_path)
        elif '_D' in dirname:
            all_degraded.append(wav_path)
            if hour is not None and 10 <= hour <= 14:
                degraded_midday.append(wav_path)

    print(f"  Healthy sites total: {len(all_healthy)} files")
    print(f"  Degraded sites total: {len(all_degraded)} files")
    print(f"  Healthy dawn/dusk (05-07, 17-19): {len(healthy_dawn_dusk)} files")
    print(f"  Degraded midday (10-14): {len(degraded_midday)} files")

    # Analyze healthy dawn/dusk candidates
    print(f"\n{'='*70}")
    print(f"  HEALTHY DAWN/DUSK CANDIDATES")
    print(f"{'='*70}")

    healthy_results = []
    for wav_path in healthy_dawn_dusk:
        result = analyze_audio(wav_path)
        if 'error' not in result:
            healthy_results.append(result)

    # Rank by: highest low-freq ratio + highest total power
    healthy_results.sort(
        key=lambda r: r['low_pct'] + r['total_power'] * 1000, reverse=True
    )

    for i, result in enumerate(healthy_results[:10]):
        hour = extract_time_from_filename(result['filename'])
        print(f"\n  #{i+1}: {result['filename']} (hour={hour:02d})")
        print(f"    SR={result['sample_rate']}Hz  dur={result['duration']:.1f}s  RMS={result['rms']:.6f}")
        print(f"    Low={result['low_pct']:.1f}%  Mid={result['mid_pct']:.1f}%  High={result['high_pct']:.1f}%")
        print(f"    TotalPower={result['total_power']:.4f}  PeakFreq={result['peak_frequency']:.0f}Hz")
        print(f"    Fish={result['fish_power']:.8f}  Grazing={result['grazing_power']:.8f}  Shrimp={result['shrimp_power']:.8f}")

    # Analyze degraded midday candidates
    print(f"\n{'='*70}")
    print(f"  DEGRADED MIDDAY CANDIDATES")
    print(f"{'='*70}")

    degraded_results = []
    for wav_path in degraded_midday:
        result = analyze_audio(wav_path)
        if 'error' not in result:
            degraded_results.append(result)

    # Rank by: lowest total power or highest high-freq-only ratio
    degraded_results.sort(
        key=lambda r: r['total_power'], reverse=False
    )

    for i, result in enumerate(degraded_results[:10]):
        hour = extract_time_from_filename(result['filename'])
        print(f"\n  #{i+1}: {result['filename']} (hour={hour:02d})")
        print(f"    SR={result['sample_rate']}Hz  dur={result['duration']:.1f}s  RMS={result['rms']:.6f}")
        print(f"    Low={result['low_pct']:.1f}%  Mid={result['mid_pct']:.1f}%  High={result['high_pct']:.1f}%")
        print(f"    TotalPower={result['total_power']:.4f}  PeakFreq={result['peak_frequency']:.0f}Hz")
        print(f"    Fish={result['fish_power']:.8f}  Grazing={result['grazing_power']:.8f}  Shrimp={result['shrimp_power']:.8f}")

    # ========================================================================
    # Part 3: Analyze ALL healthy and degraded for overall statistics
    # ========================================================================
    print(f"\n\n{'='*70}")
    print(f"  PART 3: OVERALL HEALTHY vs DEGRADED STATISTICS")
    print(f"{'='*70}")

    all_h_results = []
    for wav_path in all_healthy:
        result = analyze_audio(wav_path)
        if 'error' not in result:
            all_h_results.append(result)

    all_d_results = []
    for wav_path in all_degraded:
        result = analyze_audio(wav_path)
        if 'error' not in result:
            all_d_results.append(result)

    if all_h_results and all_d_results:
        h_rms = np.mean([r['rms'] for r in all_h_results])
        d_rms = np.mean([r['rms'] for r in all_d_results])
        h_total = np.mean([r['total_power'] for r in all_h_results])
        d_total = np.mean([r['total_power'] for r in all_d_results])
        h_low = np.mean([r['low_pct'] for r in all_h_results])
        d_low = np.mean([r['low_pct'] for r in all_d_results])
        h_mid = np.mean([r['mid_pct'] for r in all_h_results])
        d_mid = np.mean([r['mid_pct'] for r in all_d_results])
        h_high = np.mean([r['high_pct'] for r in all_h_results])
        d_high = np.mean([r['high_pct'] for r in all_d_results])
        h_fish = np.mean([r['fish_power'] for r in all_h_results])
        d_fish = np.mean([r['fish_power'] for r in all_d_results])
        h_shrimp = np.mean([r['shrimp_power'] for r in all_h_results])
        d_shrimp = np.mean([r['shrimp_power'] for r in all_d_results])

        print(f"\n  Averages across all files:")
        print(f"                    Healthy (n={len(all_h_results)})    Degraded (n={len(all_d_results)})    Ratio (H/D)")
        print(f"  RMS Power:        {h_rms:.6f}             {d_rms:.6f}             {h_rms/d_rms:.2f}x")
        print(f"  Total Power:      {h_total:.4f}             {d_total:.4f}             {h_total/d_total:.2f}x")
        print(f"  Low %:            {h_low:.1f}%                {d_low:.1f}%")
        print(f"  Mid %:            {h_mid:.1f}%                {d_mid:.1f}%")
        print(f"  High %:           {h_high:.1f}%                {d_high:.1f}%")
        print(f"  Fish Power:       {h_fish:.8f}         {d_fish:.8f}         {h_fish/d_fish:.2f}x" if d_fish > 0 else f"  Fish Power:       {h_fish:.8f}         {d_fish:.8f}")
        print(f"  Shrimp Power:     {h_shrimp:.8f}         {d_shrimp:.8f}         {h_shrimp/d_shrimp:.2f}x" if d_shrimp > 0 else f"  Shrimp Power:     {h_shrimp:.8f}         {d_shrimp:.8f}")

    # ========================================================================
    # Part 4: Best replacement candidates summary
    # ========================================================================
    print(f"\n\n{'='*70}")
    print(f"  PART 4: BEST REPLACEMENT CANDIDATES")
    print(f"{'='*70}")

    if healthy_results:
        best_h = healthy_results[0]
        print(f"\n  BEST HEALTHY: {best_h['filename']}")
        print(f"    Low={best_h['low_pct']:.1f}%  Total={best_h['total_power']:.4f}  Fish={best_h['fish_power']:.8f}")
        print(f"    This file should have the richest, most diverse reef soundscape.")

    if degraded_results:
        best_d = degraded_results[0]
        print(f"\n  BEST DEGRADED: {best_d['filename']}")
        print(f"    Low={best_d['low_pct']:.1f}%  Total={best_d['total_power']:.4f}  Fish={best_d['fish_power']:.8f}")
        print(f"    This file should sound noticeably quieter and less complex.")

    if healthy_results and degraded_results:
        ratio = healthy_results[0]['total_power'] / degraded_results[0]['total_power']
        print(f"\n  Power contrast ratio: {ratio:.2f}x")
        print(f"  (Higher is better -- aim for >3x for audible difference)")


if __name__ == '__main__':
    main()
