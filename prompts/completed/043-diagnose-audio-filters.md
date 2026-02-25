<objective>
Diagnose two audio issues in the ReefRadar dashboard: (1) healthy and degraded demo audio sound too similar (both crackling), and (2) frequency band filter toggles don't produce a noticeable difference. This is a diagnosis-only prompt — analyze the code and audio data, produce a report, do NOT make changes yet.

Read `./CLAUDE.md` for project context.
</objective>

<context>
The Next.js 14 dashboard is at `./dashboard-next/`. The Experience page (`/experience?mode=demo`) loads two WAV files and lets users crossfade between them while toggling frequency band filters. The emotional core of the app is "hear the difference between a thriving and dying reef." If users can't hear it, the app fails.

Audio-related files:
- `src/components/experience/useAudioPlayback.ts` — Main audio hook with BiquadFilterNodes
- `src/components/experience/useDemoAudio.ts` — Demo mode: loads both WAVs, crossfade, playback
- `src/components/experience/DemoState.tsx` — Demo UI with crossfade slider and band toggles
- `src/components/audio/AudioCompare.tsx` — Separate compare page audio
- `dashboard-next/public/audio/healthy-reef.wav` — Healthy demo sample
- `dashboard-next/public/audio/degraded-reef.wav` — Degraded demo sample

MARRS audio samples are available at `data/marrs/samples/` with sites like `ind_H4` (healthy), `ind_D2` (degraded), etc. Each contains WAV files with filenames like `ind_H4_20220903_053000.WAV` (site_date_time).
</context>

<requirements>

## Part 1: Diagnose Filter Architecture

Read the audio hook files thoroughly and answer:

1. **Are BiquadFilterNodes actually created?** Find exactly where `createBiquadFilter()` is called.
2. **Are filters connected in the audio graph?** Trace the full signal path: source → [filters?] → gain → analyser → destination. Draw the actual graph.
3. **Are filters connected in PARALLEL (correct) or SERIES (wrong)?** Parallel means each filter gets a copy of the source and their outputs merge. Series means audio passes through one filter then the next (which would mute most content).
4. **What are the filter frequencies and types?** List each filter's type, frequency, and Q value.
5. **Does toggling a band actually disconnect/reconnect the filter?** Or does it just change a state variable with no audio graph effect?
6. **Is there a bypass path?** If all bands are "off", does audio still play through a direct connection?

## Part 2: Analyze Current Audio Content

Create and run `scripts/analyze_demo_audio.py` using scipy:

```python
import numpy as np
from scipy.io import wavfile
from scipy import signal

def analyze_audio(filepath):
    sample_rate, data = wavfile.read(filepath)
    if len(data.shape) > 1:
        data = data.mean(axis=1)
    data = data / (np.max(np.abs(data)) + 1e-10)

    frequencies, times, spectrogram = signal.spectrogram(data, sample_rate, nperseg=2048, noverlap=1024)

    low_mask = frequencies < 1000
    mid_mask = (frequencies >= 1000) & (frequencies < 4000)
    high_mask = frequencies >= 4000

    low_power = np.mean(spectrogram[low_mask, :])
    mid_power = np.mean(spectrogram[mid_mask, :])
    high_power = np.mean(spectrogram[high_mask, :])
    total = low_power + mid_power + high_power

    return {
        'sample_rate': sample_rate,
        'duration': len(data) / sample_rate,
        'low_pct': low_power / total * 100,
        'mid_pct': mid_power / total * 100,
        'high_pct': high_power / total * 100,
        'total_power': np.sum(spectrogram),
    }
```

Run this on both demo WAVs AND a sample of MARRS files to compare. Install scipy if needed: `pip install scipy numpy`.

Report:
- Sample rate of each file
- Duration of each file
- Frequency band distribution (low/mid/high percentages)
- Total power comparison
- Whether the two files actually have different spectral content

## Part 3: Survey MARRS Samples for Better Candidates

Scan `data/marrs/samples/` to find recordings with maximum acoustic contrast:

1. **Healthy dawn/dusk** — Files from `*_H*` directories with hours 05-07 or 17-19 (extract from filename: `ind_H4_20220903_053000.WAV` = hour 05)
2. **Degraded midday** — Files from `*_D*` directories with hours 10-14
3. Analyze the top 5 candidates from each category using the same spectral analysis
4. Rank by: healthy = highest low-freq ratio + highest total power; degraded = lowest total power or highest high-freq-only ratio

## Part 4: Check Filter Frequencies vs Sample Rate

The Web Audio API AudioContext typically runs at 44100 or 48000 Hz, but the source WAV might be 16000 Hz or 32000 Hz. Determine:
- What sample rate are the demo WAVs?
- Does the AudioContext resample them? (Yes, browsers always resample to AudioContext.sampleRate)
- Are the filter cutoffs (1000, 2500, 4000 Hz) appropriate for the actual frequency content?
- If snapping shrimp energy is concentrated at 2-8 kHz and the WAV is 16 kHz (Nyquist = 8 kHz), a highpass at 4000 Hz only captures 4-8 kHz

</requirements>

<output>
Save the complete diagnosis report to `docs/AUDIO_DIAGNOSIS.md` with these sections:

1. **Filter Architecture** — Full audio graph diagram, whether filters work, specific bugs found
2. **Current Audio Analysis** — Spectral comparison of healthy vs degraded WAVs with numbers
3. **MARRS Sample Survey** — Top candidates for replacement with spectral data
4. **Filter Frequency Recommendations** — Whether cutoffs need adjustment based on actual content
5. **Recommended Fix Plan** — Prioritized list of what to fix and in what order

Also save the analysis script to `scripts/analyze_demo_audio.py`.
</output>

<constraints>
- This is DIAGNOSIS ONLY — do NOT modify any source code in `dashboard-next/src/`
- DO create and run the Python analysis script
- DO create the diagnosis report
- Install scipy/numpy if not present (`pip install scipy numpy`)
</constraints>

<success_criteria>
- Analysis script runs successfully on both demo WAVs
- MARRS samples analyzed for replacement candidates
- Filter architecture fully documented with specific bug identification
- Diagnosis report saved to docs/AUDIO_DIAGNOSIS.md
- Clear, actionable fix plan in the report
</success_criteria>
