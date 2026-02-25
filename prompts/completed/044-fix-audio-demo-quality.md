<objective>
Fix the audio demo quality in the ReefRadar dashboard based on the diagnosis in `docs/AUDIO_DIAGNOSIS.md`. This involves: (1) fixing frequency band filters so toggles produce audible differences, (2) replacing demo WAV files with acoustically distinct MARRS samples, and (3) adjusting filter cutoff frequencies to match actual content.

Read `./CLAUDE.md` for project context. Read `./docs/AUDIO_DIAGNOSIS.md` for the diagnosis findings — that report tells you exactly what's broken and what to fix.
</objective>

<context>
The Next.js 14 dashboard is at `./dashboard-next/`. The diagnosis report (from the previous prompt) contains:
- Filter architecture bugs identified
- Spectral analysis of current audio files
- MARRS sample candidates ranked by acoustic contrast
- Recommended filter frequency adjustments

Audio files:
- `src/components/experience/useAudioPlayback.ts` — Main audio hook
- `src/components/experience/useDemoAudio.ts` — Demo mode audio
- `src/components/experience/DemoState.tsx` — Demo UI
- `dashboard-next/public/audio/healthy-reef.wav` — Current healthy sample (to be replaced)
- `dashboard-next/public/audio/degraded-reef.wav` — Current degraded sample (to be replaced)
- `data/marrs/samples/` — MARRS WAV files for replacement candidates
</context>

<requirements>

## Fix 1: Repair Frequency Band Filters

Based on the diagnosis report, fix the filter implementation in `useAudioPlayback.ts`:

1. **Correct audio graph architecture** — Filters must be in PARALLEL, not series:
   ```
   source ──→ lowPassFilter ──→ lowGain ──┐
   source ──→ bandPassFilter ──→ midGain ──┼──→ analyser ──→ destination
   source ──→ highPassFilter ──→ highGain ─┘
   ```
   Each filter gets its own copy of the source signal. Each has its own gain node. Toggling a band sets that gain to 0 (off) or 1 (on).

2. **Toggling must affect the audio graph** — Don't just set a state variable. When a band is toggled off, set its gain node to 0. When on, set to 1. Use `gainNode.gain.setValueAtTime(value, ctx.currentTime)` for click-free switching.

3. **All three bands ON by default** — When playback starts, all gains = 1.

4. **Apply to BOTH healthy and degraded sources** — In demo mode, both source buffers go through the same filter bank.

## Fix 2: Adjust Filter Frequencies

Based on the diagnosis report's recommendations, update the filter cutoffs. Likely values (verify against report):

- **Low (Fish Calls):** lowpass at 800 Hz (fish grunts/pops are 100-800 Hz)
- **Mid (Grazing):** bandpass centered at 2000 Hz, Q=1.5 (parrotfish scraping 800-3500 Hz)
- **High (Snapping Shrimp):** highpass at 3500 Hz (snapping shrimp 3.5-15+ kHz)

Use the ACTUAL values from the diagnosis report if different.

## Fix 3: Replace Demo Audio with Acoustically Distinct MARRS Samples

Using the ranked candidates from the diagnosis report:

1. **Select the best healthy sample** — Highest low-frequency content + high total power (dawn/dusk recording from a `_H` site)
2. **Select the best degraded sample** — Lowest total power or highest shrimp-only ratio (midday from a `_D` site)
3. **Trim to consistent length** — Both clips should be the same duration. Use scipy to trim:
   ```python
   from scipy.io import wavfile
   sr, data = wavfile.read(source_path)
   # Trim to 15 seconds (or whatever length works)
   target_samples = sr * 15
   trimmed = data[:target_samples]
   wavfile.write(output_path, sr, trimmed)
   ```
4. **Copy to public/audio/** — Replace `healthy-reef.wav` and `degraded-reef.wav`
5. **Normalize volume** — Both clips should have similar peak amplitude so the volume difference is from content, not recording level

Create a script `scripts/prepare_demo_audio.py` that does the selection, trimming, normalization, and copying.

## Fix 4: Update DemoState UI Labels

If the filter frequencies changed, update the band labels in `DemoState.tsx`:
- "Fish Calls (< 800 Hz)" instead of generic "Low"
- "Grazing (800-3500 Hz)" instead of "Mid"
- "Snapping Shrimp (> 3500 Hz)" instead of "High"

</requirements>

<constraints>
- AudioContext MUST only be created on user interaction (click handler)
- Use Golden Hour palette colors for any new/modified UI
- Do not break the `/dashboard/compare` page AudioCompare
- WAV files must remain WAV (no format conversion)
- Build must pass with zero errors
- Do not add forbidden colors (#00FFFF, #00E5FF, #00FFA3, #FF6B6B)
</constraints>

<verification>
After all fixes:

1. **Build check:**
   ```bash
   cd dashboard-next && npm run build
   ```

2. **Audio analysis of new samples:**
   ```bash
   python scripts/analyze_demo_audio.py
   ```
   Verify the new healthy and degraded samples have clearly different spectral distributions.

3. **Filter code verification:**
   - Read `useAudioPlayback.ts` — confirm parallel filter architecture
   - Confirm 3 separate GainNodes for band toggling
   - Confirm gain.setValueAtTime used for toggle

4. **Forbidden color check:**
   ```bash
   grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B' dashboard-next/src/ --include='*.tsx' --include='*.ts'
   ```

5. **File size check** — New WAV files should be reasonable (< 2MB each for ~15s clips)
</verification>

<success_criteria>
- New healthy sample has significantly more low-frequency content than degraded
- New degraded sample is notably quieter or shrimp-dominated
- Toggling "Fish Calls" off makes an audible difference on healthy audio
- Toggling "Snapping Shrimp" off reduces crackling
- Crossfade from healthy to degraded is perceptually distinct
- Build passes with zero errors
</success_criteria>
