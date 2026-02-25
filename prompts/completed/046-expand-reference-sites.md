<objective>
Expand the reference site database from the current 8 sites (with real SurfPerch embeddings in metadata.json v3.0) to incorporate the full 44 MARRS sites that already have coordinates in `data/embeddings/marrs_sites.json`. The goal is to make the map denser and the dashboard site count accurate.

This prompt focuses on integrating sites we already have data for — NOT generating new embeddings via Lambda (that requires separate AWS infrastructure work). Instead, we expand the metadata used by the dashboard to show all known sites with their coordinates, countries, and health statuses.
</objective>

<context>
Read CLAUDE.md for project conventions and architecture.

Key files to examine:
- `data/embeddings/metadata.json` — Current v3.0 with 8 sites and real 1280-dim embeddings
- `data/embeddings/marrs_sites.json` — All 44+ MARRS sites with coordinates
- `data/embeddings/metadata_v4.json` — Check if this exists and what version it contains
- `lambdas/router/handler.py` — /sites endpoint returns site data
- `dashboard-next/src/lib/api.ts` — API client fetching sites
- `dashboard-next/src/types/index.ts` — Site type definition
- `dashboard-next/src/app/sites/page.tsx` — Sites listing page
- `dashboard-next/src/components/map/ReefMap.tsx` — Map visualization
- `dashboard-next/src/components/map/MapControls.tsx` — Country/status filters

The MARRS sample directories at `data/marrs/samples/` contain 44 sites across 5 countries:
- Australia: 7 sites (3 healthy, 3 degraded, 1 restored_mid)
- Indonesia: 21 sites (6 healthy, 6 degraded, 3 restored_early, 6 restored_mid)
- Kenya: 5 sites (2 healthy, 2 degraded, 1 restored_early)
- Maldives: 5 sites (2 healthy, 2 degraded, 1 restored_early)
- Mexico: 7 sites (3 healthy, 2 degraded, 1 restored_early, 1 restored_mid)
</context>

<requirements>

## Step 1: Audit Current Metadata

Read and analyze:
1. `data/embeddings/metadata.json` — understand the v3.0 schema
2. `data/embeddings/marrs_sites.json` — understand full site list with coordinates
3. `data/embeddings/metadata_v4.json` — check what already exists

Determine: Which of the 44 MARRS sites have coordinates but are NOT in the current metadata?

## Step 2: Create Expanded Metadata v5.0

Create `data/embeddings/metadata_v5.json` that:
1. Keeps all 8 existing sites with their real SurfPerch embeddings intact
2. Adds the remaining ~36 MARRS sites from marrs_sites.json
3. For sites without embeddings, set `embedding: null` and add `has_embedding: false`
4. For sites WITH embeddings, set `has_embedding: true`
5. All sites must have: site_id, country, country_name, status, latitude, longitude, has_embedding
6. Include metadata fields: version "5.0", total_sites count, sites_with_embeddings count

Schema:
```json
{
  "version": "5.0",
  "total_sites": 44,
  "sites_with_embeddings": 8,
  "embedding_model": "surfperch_v1",
  "embedding_dim": 1280,
  "sites": [
    {
      "site_id": "ind_H4",
      "country": "Indonesia",
      "region": "South Sulawesi",
      "status": "healthy",
      "latitude": -5.123,
      "longitude": 119.456,
      "has_embedding": true,
      "embedding": [0.123, ...],
      "source": "MARRS"
    }
  ]
}
```

## Step 3: Update the Lambda Router /sites Endpoint

Modify `lambdas/router/handler.py` to:
1. Load metadata_v5.json from S3 instead of metadata.json (or handle both with fallback)
2. The /sites endpoint should return ALL sites (not just those with embeddings)
3. Add a query parameter `?has_embedding=true` to filter only sites with embeddings
4. Include `has_embedding` field in the response for each site
5. Update the total_sites count in the response

IMPORTANT: Do NOT deploy the Lambda — just update the code. Deployment will be done separately.

## Step 4: Update Dashboard Types

Update `dashboard-next/src/types/index.ts`:
- Add `has_embedding?: boolean` to the Site type
- Add `region?: string` to the Site type if not present
- Add `source?: string` to the Site type if not present

## Step 5: Update Dashboard Site Count

Search the dashboard code for hardcoded site counts (like "44 Sites" or "8 sites") and update them to use the actual count from the API response. Check:
- `dashboard-next/src/components/experience/DemoState.tsx` — "Explore 44 Sites on Map"
- Any other components referencing site counts

Replace hardcoded numbers with dynamic counts where feasible, or update the hardcoded number to match the new total.

## Step 6: Update Map to Handle Sites Without Embeddings

In `dashboard-next/src/components/map/ReefMap.tsx`:
- Sites without embeddings should still appear on the map
- Use slightly different styling (e.g., smaller radius, lower opacity, or dashed border) to distinguish sites WITH embeddings from those without
- Add a small legend indicator for "Full data" vs "Location only" sites

## Step 7: Upload Metadata to S3

Write a script `scripts/upload_metadata_v5.py` that:
1. Reads `data/embeddings/metadata_v5.json`
2. Uploads it to `s3://reefradar-2477-embeddings/metadata_v5.json`
3. Also uploads as `s3://reefradar-2477-embeddings/metadata.json` (replacing current)
4. Prints confirmation with file size and site count

Do NOT run this script automatically — just create it. The user will run it when ready.
</requirements>

<constraints>
- Preserve all existing 8 site embeddings exactly — do not modify their embedding arrays
- Do not invoke any AWS Lambda functions for generating new embeddings
- The /sites API must remain backward-compatible (existing dashboard versions should not break)
- All coordinate data must come from marrs_sites.json or the existing metadata — do not fabricate coordinates
- Region names should be accurate: "South Sulawesi" for Indonesia, "Great Barrier Reef" for Australia, "Mombasa Coast" for Kenya, "North Male Atoll" for Maldives, "Caribbean Coast" for Mexico
</constraints>

<verification>
1. `data/embeddings/metadata_v5.json` exists and is valid JSON
2. It contains exactly the same 8 embeddings as v3.0 (verify by comparing embedding arrays)
3. Total site count matches the MARRS sample directories (44 or 45)
4. All sites have latitude and longitude (no nulls)
5. `cd dashboard-next && npm run build` passes
6. `scripts/upload_metadata_v5.py` exists and is syntactically valid Python
</verification>

<success_criteria>
- metadata_v5.json has 44+ sites with coordinates
- 8 sites retain their real SurfPerch embeddings
- Lambda router code updated to serve expanded data
- Dashboard types updated
- Map shows all sites (with visual distinction for embedding vs no-embedding)
- Build passes
</success_criteria>
