<objective>
Build a dynamic audio comparison feature that lets users select a location (country) and A/B compare reef health states (healthy, degraded, restored_early, restored_mid) at that location. Currently the demo only compares a fixed pair (Mexico healthy vs Malaysia degraded). The new feature should let users pick from all 5 MARRS countries and hear available health states via crossfade.
</objective>

<context>
Read CLAUDE.md for project conventions and architecture.

Key files to examine:
- `dashboard-next/src/components/experience/useDemoAudio.ts` — Current audio hook (parallel BiquadFilter bank, equal-power crossfade, looping)
- `dashboard-next/src/components/experience/DemoState.tsx` — Current demo UI (play/pause, crossfade slider, band toggles)
- `dashboard-next/src/app/experience/page.tsx` — Experience page state machine
- `dashboard-next/public/audio/` — Current audio files (healthy-reef.wav, degraded-reef.wav)
- `.gitignore` — Has `*.wav` blocked except `!dashboard-next/public/audio/*.wav`

MARRS sample directories at `data/marrs/samples/`:
- Australia: aus_D1-3 (degraded), aus_H1-3 (healthy), aus_R1 (restored_mid)
- Indonesia: ind_D1-6, ind_H1-6, ind_N1-3 (restored_early), ind_R1-6 (restored_mid)
- Kenya: ken_D1,D3, ken_H1-2, ken_N1
- Maldives: mal_D1-2, mal_H1-2, mal_N1
- Mexico: mex_D1-2, mex_H1-3, mex_N1, mex_R1

Naming convention: `{country}_{status}{number}` where H=healthy, D=degraded, R=restored_mid, N=restored_early.

The design system uses the "Golden Hour" palette: abyss (#1a1714), bone (#e5e1db), ochre (#cd853f), dusty-rose (#c08081). Glass panels with backdrop-blur.
</context>

<requirements>

## Step 1: Audit MARRS Paired Locations

Write a Python script `scripts/audit_paired_locations.py` that:
1. Scans `data/marrs/samples/` directories
2. Groups sites by country code (aus, ind, ken, mal, mex)
3. For each country, identifies available health states
4. Counts WAV files per site
5. Outputs a JSON file `data/paired_audio_locations.json` with structure:
```json
{
  "locations": [
    {
      "id": "ind",
      "name": "Indonesia",
      "region": "Sulawesi",
      "available_states": ["healthy", "degraded", "restored_early", "restored_mid"],
      "sites_per_state": { "healthy": 6, "degraded": 6, "restored_early": 3, "restored_mid": 6 }
    }
  ]
}
```
6. Run the script and verify the output

## Step 2: Prepare Comparison Audio Files

Write a Python script `scripts/prepare_comparison_audio.py` that:
1. Reads `data/paired_audio_locations.json`
2. For each location and health state, selects the best WAV files from `data/marrs/samples/`
3. Uses ffmpeg to:
   - Concatenate selected files
   - Trim to 30 seconds
   - Resample to 16kHz mono (consistent with existing demo files)
   - Normalize audio levels
4. Outputs to `dashboard-next/public/audio/compare/{country}/{status}.wav`
   (e.g., `dashboard-next/public/audio/compare/ind/healthy.wav`)
5. Run the script

Selection strategy per country per status:
- Pick the site with the most WAV files
- From that site, select 3-5 WAV files randomly
- Concatenate and trim to 30s

## Step 3: Create Audio Manifest

Create `dashboard-next/public/audio/compare/manifest.json` with:
```json
{
  "locations": [
    {
      "id": "ind",
      "name": "Indonesia",
      "region": "Sulawesi",
      "coordinates": { "lat": -4.93, "lon": 119.32 },
      "available": ["healthy", "degraded", "restored_early", "restored_mid"],
      "files": {
        "healthy": "/audio/compare/ind/healthy.wav",
        "degraded": "/audio/compare/ind/degraded.wav",
        "restored_early": "/audio/compare/ind/restored_early.wav",
        "restored_mid": "/audio/compare/ind/restored_mid.wav"
      },
      "description": "MARRS restoration sites in South Sulawesi"
    }
  ]
}
```

Use these coordinates:
- Indonesia: lat -4.93, lon 119.32 (Sulawesi)
- Australia: lat -18.0, lon 147.0 (Great Barrier Reef)
- Kenya: lat -4.02, lon 39.67 (Mombasa Coast)
- Maldives: lat 4.17, lon 73.51 (North Male Atoll)
- Mexico: lat 20.21, lon -87.43 (Caribbean Coast)

## Step 4: Update .gitignore

The current .gitignore blocks `*.wav` except `!dashboard-next/public/audio/*.wav`. The new files are in a subdirectory, so add:
```
!dashboard-next/public/audio/compare/**/*.wav
```

## Step 5: Create Location-Aware Demo Audio Hook

Create `dashboard-next/src/components/experience/useLocationAudio.ts`:

This hook should:
1. Fetch `/audio/compare/manifest.json` on mount
2. Expose `locations` array, `selectedLocation`, `setSelectedLocation`
3. When a location is selected, expose `availableStates` for that location
4. Support selecting `leftTrack` and `rightTrack` from available states
5. Reuse the same audio architecture as `useDemoAudio.ts`:
   - AudioContext with parallel BiquadFilter bank (lowpass 800Hz, bandpass 2000Hz Q=1.5, highpass 3500Hz)
   - Equal-power crossfade: `cos(angle)` / `sin(angle)` where `angle = value * PI/2`
   - GainNode per band for click-free toggling via `setValueAtTime`
   - Looping sources
6. When tracks change, stop current sources, load new buffers, and restart if was playing
7. Return the same interface shape as `useDemoAudio` plus location-specific fields:
   ```typescript
   interface LocationAudioReturn {
     // Existing fields from useDemoAudio
     isPlaying: boolean;
     currentTime: number;
     duration: number;
     analyserNode: AnalyserNode | null;
     loadState: 'idle' | 'loading' | 'ready' | 'error';
     handlePlayPause: () => Promise<void>;
     crossfade: number;
     setCrossfade: (v: number) => void;
     activeBands: Set<BandId>;
     toggleBand: (band: BandId) => void;
     // New location fields
     locations: Location[];
     selectedLocation: Location | null;
     setSelectedLocation: (id: string) => void;
     leftTrack: HealthStatus;
     rightTrack: HealthStatus;
     setLeftTrack: (s: HealthStatus) => void;
     setRightTrack: (s: HealthStatus) => void;
   }
   ```

## Step 6: Create Location Compare UI

Create `dashboard-next/src/components/experience/LocationCompare.tsx`:

Layout (following existing Golden Hour design):
1. **Location selector** — Row of pill buttons (one per country), styled like the existing track toggle buttons in DemoState.tsx. Selected location gets `ring-2 ring-ochre`. Show available state count as a badge.

2. **Health state selector** — After selecting a location, show available states as a horizontal bar ordered: Degraded → Early Restoration → Mid Restoration → Healthy. Left track highlighted with ochre border, right track with dusty-rose border. Clicking a third state shifts right→left and sets the new one as right.

3. **Crossfade slider** — Identical to existing, with left/right labels showing the selected state names.

4. **Playback controls** — Play/Pause button, time display (same style as DemoState).

5. **Frequency band toggles** — Same as existing DemoState.

6. **Info panel** — Right side, describes what's being compared. Update text based on selected location and tracks.

## Step 7: Integrate into Experience Page

Update `dashboard-next/src/app/experience/page.tsx`:
- Add a new state to the state machine: `{ type: 'compare' }`
- Add action `GO_COMPARE`
- In the landing state, add a third CTA: "Compare Locations" alongside the existing demo and upload options
- In the DemoState, add a link/button to switch to the compare view
- The compare state renders `<LocationCompare />`

## Step 8: Keep Existing Demo Working

Do NOT remove or break the existing `useDemoAudio.ts` or `DemoState.tsx`. The fixed healthy-vs-degraded demo should continue to work as-is. The new LocationCompare is an additional feature.
</requirements>

<constraints>
- All new components must use the Golden Hour design system (abyss, bone, ochre, dusty-rose, glass-panel)
- Audio architecture must match the proven pattern in useDemoAudio.ts (parallel filter bank, equal-power crossfade)
- Do NOT add new npm dependencies — use only Web Audio API, existing React hooks, and framer-motion
- WAV files must be 16kHz mono to match existing demo audio
- The manifest.json must only reference files that actually exist after Step 2
- ffmpeg is available on this system — use subprocess.run() in Python scripts
</constraints>

<verification>
1. Run `python scripts/audit_paired_locations.py` — should output valid JSON
2. Run `python scripts/prepare_comparison_audio.py` — should create WAV files in `dashboard-next/public/audio/compare/`
3. Verify all countries have at least healthy + degraded audio
4. Run `cd dashboard-next && npm run build` — must pass with zero errors
5. Verify manifest.json references only files that exist on disk
</verification>

<success_criteria>
- 5 countries available for selection (Indonesia, Australia, Kenya, Maldives, Mexico)
- Indonesia shows all 4 states; other countries show at least 2
- Crossfader works between any two selected states at the same location
- Frequency band toggles affect the audio graph (not cosmetic-only)
- Existing demo mode still works unchanged
- Build passes cleanly
</success_criteria>
