<objective>
Complete the Hurricane Irma site expansion by downloading remaining audio datasets,
generating SurfPerch embeddings, and updating all metadata and dashboard references.

Currently we have 1 of 4 planned Irma sites (Western Dry Rocks post-hurricane only).
This prompt adds the 3 missing datasets: WDR pre-hurricane, Eastern Sambo pre-hurricane,
and Eastern Sambo post-hurricane. It also updates the README with data source attribution.
</objective>

<context>
Read CLAUDE.md for project conventions.

Current state:
- 54 sites across 7 countries, 48 with real SurfPerch embeddings
- irma_western_dry_rocks: HAS post-hurricane embedding (from WDR_wav_Oct)
- irma_eastern_sambo: location-only (no audio yet)
- Zenodo dataset DOI: 10.5061/dryad.sxksn0319 has all 4 audio archives

Key files to examine:
- `scripts/generate_expansion_embeddings.py` — existing embedding generation script (reuse its wav_to_float_samples and Lambda invocation pattern)
- `scripts/merge_expansion_embeddings.py` — merges embeddings into metadata
- `scripts/merge_metadata_v6.py` — how metadata sites were structured
- `data/embeddings/metadata_v6.json` — current metadata (54 sites)
- `dashboard-next/src/types/index.ts` — SITE_COORDINATES, ReefStatus type
- `dashboard-next/src/app/page.tsx` — site count references
- `dashboard-next/src/app/dashboard/page.tsx` — site count references
- `dashboard-next/src/app/dashboard/map/page.tsx` — site count references
- `dashboard-next/src/components/experience/DemoState.tsx` — site count references
- `dashboard-next/src/app/about/page.tsx` — data source citations
- `README.md` — needs data source attribution section
</context>

<requirements>

<step_1_download>
Download the 3 missing Hurricane Irma audio archives from Zenodo/Dryad.
These are large files (~400-500MB each), so use wget with background/continue support.

```bash
cd ~/ReefRadar/data/audio/hurricane_irma

# Pre-hurricane Western Dry Rocks (July 2017)
wget "https://zenodo.org/records/4396323/files/WDR_wav_Jul.zip?download=1" -O WDR_wav_Jul.zip

# Eastern Sambo pre-hurricane (July 2017)
wget "https://zenodo.org/records/4396323/files/ESB_wav_Jul.zip?download=1" -O ESB_wav_Jul.zip

# Eastern Sambo post-hurricane (October 2017)
wget "https://zenodo.org/records/4396323/files/ESB_wav_Oct.zip?download=1" -O ESB_wav_Oct.zip
```

After download, extract each:
```bash
cd ~/ReefRadar/data/audio/hurricane_irma
unzip -o WDR_wav_Jul.zip -d extracted/
unzip -o ESB_wav_Jul.zip -d extracted/
unzip -o ESB_wav_Oct.zip -d extracted/
```

Verify extracted directories contain WAV files (expect directories like WDR_wav_Jul/, ESB_wav_Jul/, ESB_wav_Oct/ inside extracted/).
</step_1_download>

<step_2_add_sites>
Add 3 new sites to metadata_v6.json. The naming convention distinguishes pre/post hurricane:
- `irma_western_dry_rocks_pre` — WDR July 2017 (before Hurricane Irma)
- `irma_eastern_sambo_pre` — ESB July 2017 (before Hurricane Irma)
- `irma_eastern_sambo_post` — ESB October 2017 (after Hurricane Irma)

The existing `irma_eastern_sambo` location-only site should be REPLACED by `irma_eastern_sambo_post`
(same coordinates, but now with audio). The existing `irma_western_dry_rocks` stays as-is (it's the
post-hurricane site).

Net change: remove 1 location-only site (irma_eastern_sambo), add 3 new sites = 56 total sites.

Write a script `scripts/add_irma_sites.py` that:
1. Loads metadata_v6.json
2. Removes the `irma_eastern_sambo` entry
3. Adds 3 new site entries (location-only initially, embeddings added later):
   - irma_western_dry_rocks_pre: lat=24.4468, lon=-81.9275, country=USA, region=Caribbean, status=unknown, source=dryad_irma
   - irma_eastern_sambo_pre: lat=24.4915, lon=-81.6625, country=USA, region=Caribbean, status=unknown, source=dryad_irma
   - irma_eastern_sambo_post: lat=24.4915, lon=-81.6625, country=USA, region=Caribbean, status=unknown, source=dryad_irma
4. Updates total_sites count
5. Saves metadata_v6.json

Run the script after writing it.
</step_2_add_sites>

<step_3_generate_embeddings>
Write a script `scripts/generate_irma_embeddings.py` that generates embeddings for the 3 new sites.

Reuse the pattern from `scripts/generate_expansion_embeddings.py`:
- Import and reuse `wav_to_float_samples`, `read_wav_info` functions from that script, OR copy them
- Use the same Lambda invocation pattern (segments format, response unwrapping)
- Same constants: LAMBDA_FUNCTION='reefradar-2477-inference', REGION='us-east-1', SAMPLES_PER_SITE=10

Directory mapping (check actual extracted paths — ls the directories first):
- irma_western_dry_rocks_pre → extracted/WDR_wav_Jul/
- irma_eastern_sambo_pre → extracted/ESB_wav_Jul/
- irma_eastern_sambo_post → extracted/ESB_wav_Oct/

Save output to `data/embeddings/irma_expansion_embeddings.json` (separate from the existing expansion_embeddings.json).

Run the script. Expect ~2-3 minutes for 30 Lambda invocations (10 per site).
</step_3_generate_embeddings>

<step_4_merge_and_upload>
Write a script `scripts/merge_irma_embeddings.py` (or extend merge_expansion_embeddings.py) that:
1. Loads irma_expansion_embeddings.json
2. Patches matching sites in metadata_v6.json with their embeddings
3. Saves metadata_v6.json

Then upload to S3:
```bash
python3 scripts/upload_metadata_v6.py
```

Verify: the output should show 56 total sites, 51 with embeddings, 5 location-only.
</step_4_merge_and_upload>

<step_5_update_dashboard>
Update all dashboard references:

1. **`dashboard-next/src/types/index.ts`** — Update SITE_COORDINATES:
   - Remove `irma_eastern_sambo` entry
   - Add `irma_western_dry_rocks_pre` (same coords as irma_western_dry_rocks: lat=24.4468, lon=-81.9275)
   - Add `irma_eastern_sambo_pre` (lat=24.4915, lon=-81.6625, location='Florida Keys, USA')
   - Add `irma_eastern_sambo_post` (lat=24.4915, lon=-81.6625, location='Florida Keys, USA')

2. **Site counts** — Update "54" to "56" in all locations:
   - `dashboard-next/src/app/page.tsx`
   - `dashboard-next/src/app/dashboard/page.tsx`
   - `dashboard-next/src/app/dashboard/map/page.tsx`
   - `dashboard-next/src/components/experience/DemoState.tsx`

3. **`dashboard-next/src/app/about/page.tsx`** — Update the reference data description to mention 56 sites and pre/post hurricane comparison.
</step_5_update_dashboard>

<step_6_readme_attribution>
Add a "Data Sources" section to README.md after the "Known Limitations" section (or at the end).

Include academic citations for:
- **MARRS Foundation** — Mars Assisted Reef Restoration System monitoring data (Indonesia, primary training data)
- **Hurricane Irma Reef Acoustics** — Kaplan et al. (2020), Dryad Digital Repository, DOI: 10.5061/dryad.sxksn0319 (Florida Keys, pre/post hurricane comparison)
- **CoralSoundExplorer** — Zenodo, DOI: 10.5281/zenodo.14577064 (French Polynesia, Bora-Bora soundscapes)
- **NOAA SanctSound** — Sanctuary Soundscape Monitoring Project (Florida Keys passive acoustic monitoring)

Keep it concise — 4-6 lines with DOI links where available.
</step_6_readme_attribution>

<step_7_build_verify>
Run the Next.js build to verify no TypeScript errors:
```bash
cd dashboard-next && npm run build
```

Verify API returns updated data:
```bash
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Sites: {d[\"total_sites\"]}, Countries: {len(d[\"countries\"])}')"
```

Expected: Sites: 56, Countries: 7
</step_7_build_verify>

</requirements>

<constraints>
- Do NOT deploy Lambda functions — only update S3 metadata and dashboard code
- The router Lambda already loads metadata_v6.json from S3, so uploading the updated file is sufficient
- Audio files are large (400-500MB zips). Start downloads first, then work on other steps while waiting
- Lambda payload limit is 6MB — the existing wav_to_float_samples extracts 5s segments to stay under this
- All AWS operations must use --region us-east-1
- Preserve all existing sites and embeddings in metadata_v6.json — only add/replace Irma sites
</constraints>

<verification>
Before declaring complete, verify:
1. All 3 zip files downloaded and extracted with WAV files present
2. Embeddings generated for all 3 new sites (1280 dims each)
3. metadata_v6.json has 56 sites, 51 with embeddings
4. S3 upload successful
5. Dashboard build passes with no TypeScript errors
6. API returns 56 sites
7. README has data source citations
</verification>

<success_criteria>
- 56 total sites across 7 countries
- 51 sites with real SurfPerch embeddings (was 48)
- 5 location-only sites remaining (4 SanctSound + was 6, minus irma_eastern_sambo replaced)
- Pre/post hurricane comparison possible for both WDR and ESB locations
- Dashboard builds cleanly
- README properly attributes all data sources
</success_criteria>
