<objective>
Replace the synthetic audio demo with real MARRS coral reef recordings and update all hardcoded dashboard text from "8 sites / 2 countries" to "45 sites / 5 countries". This prompt requires NO AWS access -- everything is local file operations and Next.js code changes.

After this prompt, the A/B comparison will play real reef audio and all dashboard text will be accurate for the upcoming 45-site expansion.
</objective>

<context>
Read `./CLAUDE.md` for full project context.

The ReefRadar dashboard at `./dashboard-next/` currently uses a `SyntheticAudioGenerator.ts` that creates pink/brown noise to simulate reef audio. Real MARRS recordings already exist locally at `./data/marrs_audio/` with the following structure:

- `ind_H4/` subdirectory — healthy reef WAVs (ind_H4_*.WAV)
- `ind_H5/` subdirectory — healthy reef WAVs
- `ind_D2_*.WAV` — degraded reef WAVs (flat files in root)
- `ind_N1/` subdirectory — restored early
- `ken_H1/` subdirectory — healthy Kenya

Each WAV is ~1.9MB, mono, 32kHz sample rate, ~30 seconds each.

The MARRS dataset has 45 sites across 5 countries (Australia: 7, Indonesia: 21, Kenya: 5, Maldives: 5, Mexico: 7) per `./data/embeddings/marrs_sites.json`. Current `metadata.json` is v3.0 with only 8 deployed reference sites.

Key files to read before starting:
- `./dashboard-next/src/components/audio/AudioCompare.tsx` — current synthetic audio integration
- `./dashboard-next/src/components/audio/SyntheticAudioGenerator.ts` — file to DELETE
- `./dashboard-next/src/app/dashboard/compare/page.tsx` — compare page description text
- `./dashboard-next/src/components/landing/SoundSection.tsx` — landing page audio embed
</context>

<requirements>

## Part 1: Create Demo Audio Files

Create `./scripts/prepare_demo_audio.py` that:

1. Reads WAV files from `./data/marrs_audio/` handling BOTH patterns:
   - Subdirectory: `./data/marrs_audio/ind_H4/*.WAV`
   - Flat files: `./data/marrs_audio/ind_D2_*.WAV`
2. Concatenates multiple WAVs into ~15-second demo files
3. Outputs to `./dashboard-next/public/audio/`:
   - `healthy-reef.wav` — from ind_H4 recordings
   - `degraded-reef.wav` — from ind_D2 recordings
4. Creates `./dashboard-next/public/audio/ATTRIBUTION.md` with MARRS CC-BY 4.0 citation

Use only Python stdlib (`wave`, `struct`, `pathlib`). No external dependencies.

Run the script after creating it. Verify output files exist and are reasonable size (~1-3MB each).

## Part 2: Update AudioCompare.tsx

In `./dashboard-next/src/components/audio/AudioCompare.tsx`:

1. **Remove** the import of `generateHealthyReef` and `generateDegradedReef` from `./SyntheticAudioGenerator`
2. **Replace** the `initAudio` function's buffer generation. Currently it calls:
   ```
   const healthyBuf = generateHealthyReef(ctx, 15);
   const degradedBuf = generateDegradedReef(ctx, 15);
   ```
   Replace with async fetch + decode:
   ```typescript
   const [healthyResponse, degradedResponse] = await Promise.all([
     fetch('/audio/healthy-reef.wav'),
     fetch('/audio/degraded-reef.wav'),
   ]);

   if (!healthyResponse.ok || !degradedResponse.ok) {
     throw new Error('Failed to load audio files');
   }

   const [healthyArrayBuffer, degradedArrayBuffer] = await Promise.all([
     healthyResponse.arrayBuffer(),
     degradedResponse.arrayBuffer(),
   ]);

   const [healthyBuf, degradedBuf] = await Promise.all([
     ctx.decodeAudioData(healthyArrayBuffer),
     ctx.decodeAudioData(degradedArrayBuffer),
   ]);
   ```
3. **Update the header banner** (line ~259-263): Change "Demo audio generated synthetically -- upload real reef recordings for actual analysis" to "Real reef recordings from the MARRS dataset (CC-BY 4.0) -- Williams et al. 2024"
4. **Change the AlertTriangle icon to a Volume2 or Info icon** in the banner since it's no longer a warning -- it's attribution. Use a neutral info-style color instead of amber.

## Part 3: Delete SyntheticAudioGenerator.ts

1. Delete `./dashboard-next/src/components/audio/SyntheticAudioGenerator.ts`
2. Search all files under `./dashboard-next/src/` for any remaining imports or references to `SyntheticAudioGenerator` and remove them
3. Verify no other component imports from this file

## Part 4: Update Compare Page Text

In `./dashboard-next/src/app/dashboard/compare/page.tsx`:

Change the description paragraph from:
"Use the crossfader to blend between synthesised healthy and degraded coral reef soundscapes"
to:
"Use the crossfader to blend between real healthy and degraded coral reef recordings from the MARRS dataset while watching their spectrograms in real time."

## Part 5: Update All Hardcoded Dashboard Text

Search and update across `./dashboard-next/src/`:

| File | Current text | New text |
|------|-------------|----------|
| `app/about/page.tsx:229` | "8 validated sites from 45-site MARRS dataset" | "45 validated sites across 5 countries from the MARRS dataset" |
| `app/about/page.tsx:279` | "Currently 8 reference sites; expanding to full 45-site MARRS dataset" | "45 reference sites across 5 countries (Indonesia, Australia, Kenya, Maldives, Mexico)" |
| `app/dashboard/page.tsx:34` | "Browse the 8 reference sites across Indonesia and Kenya" | "Browse 45 reference sites across 5 countries" |
| `components/landing/HowItWorks.tsx:183` | "8 reference sites currently deployed" | "45 reference sites across 5 countries" |
| `components/dashboard/CaveatsBanner.tsx:10` | "(Indonesia, Kenya)" | "(Indonesia, Australia, Kenya, Maldives, Mexico)" |
| `components/dashboard/RegionWarning.tsx:33` | "Indonesia and Kenya" | "Indonesia, Australia, Kenya, Maldives, and Mexico" |
| `app/sites/page.tsx:167` | "Reference sites span Indonesia and Kenya" | "Reference sites span 5 countries: Indonesia, Australia, Kenya, Maldives, and Mexico" |
| `app/dashboard/map/page.tsx:34` | `ALL_COUNTRIES = ['Indonesia', 'Kenya']` | `ALL_COUNTRIES = ['Indonesia', 'Australia', 'Kenya', 'Maldives', 'Mexico']` |
| `components/map/MapControls.tsx:6` | `COUNTRIES = ['Indonesia', 'Kenya']` | `COUNTRIES = ['Indonesia', 'Australia', 'Kenya', 'Maldives', 'Mexico']` |

Also check `ImpactStats.tsx` -- the "8 Reference Sites" counter should become "45 Reference Sites", and "2 Countries" should become "5 Countries".

After making all text changes, do a final grep for any remaining "8 reference", "8 validated", "8 sites", "2 Countries", or "Indonesia and Kenya" in `./dashboard-next/src/` to catch anything missed.

## Part 6: Update Map Initial View

In the map component (`./dashboard-next/src/app/dashboard/map/page.tsx` or `ReefMap.tsx`):
- Change initial view to be more global: latitude ~0 (equator), longitude ~80, zoom ~2
- This ensures all 5 countries are visible on initial load instead of just Indo-Pacific

Also check `./dashboard-next/src/components/maps/WorldMap.tsx`:
- Update the default center comment and fallback from "Indonesia and Kenya" to a global center

</requirements>

<verification>
1. Run `python3 scripts/prepare_demo_audio.py` and confirm both WAV files are created in `dashboard-next/public/audio/`
2. Run `cd dashboard-next && npm run build` -- must pass with zero errors and zero TypeScript errors
3. Grep for stale references:
   ```bash
   grep -r "SyntheticAudio" dashboard-next/src/
   grep -r "8 reference\|8 validated\|8 sites" dashboard-next/src/
   grep -r "2 Countries\|2 countries" dashboard-next/src/
   grep -rn "Indonesia and Kenya" dashboard-next/src/
   grep -r "synthesised\|synthesized\|synthetically" dashboard-next/src/
   ```
   All should return zero results.
4. Verify `dashboard-next/public/audio/healthy-reef.wav` and `degraded-reef.wav` exist and are >100KB
5. Verify `dashboard-next/public/audio/ATTRIBUTION.md` exists with MARRS citation
</verification>

<success_criteria>
- SyntheticAudioGenerator.ts is deleted, no imports remain
- AudioCompare.tsx loads real WAV files via fetch, no synthetic generation
- Header banner shows MARRS attribution instead of synthetic warning
- Compare page description references "real" recordings, not "synthesised"
- All dashboard text says 45 sites / 5 countries consistently
- Map countries list includes all 5: Indonesia, Australia, Kenya, Maldives, Mexico
- Map initial view is global (zoom ~2, equator center)
- ImpactStats counters updated to 45 sites and 5 countries
- Build passes with zero errors
- No stale "8 sites" or "Indonesia and Kenya" references remain
</success_criteria>
