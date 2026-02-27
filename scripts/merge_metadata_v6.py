#!/usr/bin/env python3
"""
Merge existing v5 metadata with new expansion sites to create metadata v6.0.

New sites:
- 3 French Polynesia (Bora-Bora) - CoralSoundExplorer
- 2 Hurricane Irma (Florida Keys) - location-only
- 4 SanctSound (Florida Keys) - location-only

Total: 45 existing + 9 new = 54 sites
"""

import json
from pathlib import Path
from datetime import datetime, timezone

V5_PATH = Path('data/embeddings/metadata_v5.json')
V6_PATH = Path('data/embeddings/metadata_v6.json')

# New sites to add
NEW_SITES = [
    # French Polynesia - CoralSoundExplorer (Bora-Bora)
    {
        'site_id': 'borabora_undisturbed',
        'country': 'French Polynesia',
        'region': 'Society Islands',
        'status': 'healthy',
        'latitude': -16.5004,
        'longitude': -151.7415,
        'has_embedding': False,
        'embedding': None,
        'source': 'CoralSoundExplorer',
        'doi': '10.5281/zenodo.14577064',
        'citation': 'Minier et al. 2025, PLOS Computational Biology',
    },
    {
        'site_id': 'borabora_tourist',
        'country': 'French Polynesia',
        'region': 'Society Islands',
        'status': 'degraded',
        'latitude': -16.4864,
        'longitude': -151.7256,
        'has_embedding': False,
        'embedding': None,
        'source': 'CoralSoundExplorer',
        'doi': '10.5281/zenodo.14577064',
        'citation': 'Minier et al. 2025, PLOS Computational Biology',
    },
    {
        'site_id': 'borabora_boat_traffic',
        'country': 'French Polynesia',
        'region': 'Society Islands',
        'status': 'degraded',
        'latitude': -16.5132,
        'longitude': -151.7589,
        'has_embedding': False,
        'embedding': None,
        'source': 'CoralSoundExplorer',
        'doi': '10.5281/zenodo.14577064',
        'citation': 'Minier et al. 2025, PLOS Computational Biology',
    },
    # Hurricane Irma - Florida Keys
    {
        'site_id': 'irma_eastern_sambo',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'healthy',
        'latitude': 24.4915,
        'longitude': -81.6625,
        'has_embedding': False,
        'embedding': None,
        'source': 'Hurricane Irma Dataset',
        'doi': '10.5061/dryad.sxksn0319',
    },
    {
        'site_id': 'irma_western_dry_rocks',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'healthy',
        'latitude': 24.4468,
        'longitude': -81.9275,
        'has_embedding': False,
        'embedding': None,
        'source': 'Hurricane Irma Dataset',
        'doi': '10.5061/dryad.sxksn0319',
    },
    # NOAA SanctSound - Florida Keys
    {
        'site_id': 'sanctsound_fk01',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.5575,
        'longitude': -81.4044,
        'has_embedding': False,
        'embedding': None,
        'source': 'NOAA SanctSound',
    },
    {
        'site_id': 'sanctsound_fk02',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.5433,
        'longitude': -81.5192,
        'has_embedding': False,
        'embedding': None,
        'source': 'NOAA SanctSound',
    },
    {
        'site_id': 'sanctsound_fk03',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.6128,
        'longitude': -81.1067,
        'has_embedding': False,
        'embedding': None,
        'source': 'NOAA SanctSound',
    },
    {
        'site_id': 'sanctsound_fk04',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.4561,
        'longitude': -81.7858,
        'has_embedding': False,
        'embedding': None,
        'source': 'NOAA SanctSound',
    },
]


def main():
    # Load existing v5
    with open(V5_PATH) as f:
        metadata = json.load(f)

    print(f"Loaded v5: {len(metadata['sites'])} sites")

    existing_ids = {s['site_id'] for s in metadata['sites']}

    added = 0
    for site in NEW_SITES:
        if site['site_id'] not in existing_ids:
            metadata['sites'].append(site)
            existing_ids.add(site['site_id'])
            added += 1
        else:
            print(f"  SKIP duplicate: {site['site_id']}")

    # Update metadata
    metadata['version'] = '6.0'
    metadata['generated_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    metadata['total_sites'] = len(metadata['sites'])
    metadata['sites_with_embeddings'] = sum(
        1 for s in metadata['sites'] if s.get('has_embedding', True)
    )
    metadata['sources'] = sorted(set(
        s.get('source', 'MARRS') for s in metadata['sites']
    ))

    # Count by country
    by_country = {}
    for site in metadata['sites']:
        c = site.get('country', 'Unknown')
        by_country[c] = by_country.get(c, 0) + 1

    # Validate
    all_ids = [s['site_id'] for s in metadata['sites']]
    assert len(all_ids) == len(set(all_ids)), "Duplicate site_ids found!"
    for s in metadata['sites']:
        assert s.get('latitude') is not None, f"{s['site_id']} missing latitude"
        assert s.get('longitude') is not None, f"{s['site_id']} missing longitude"

    # Save
    with open(V6_PATH, 'w') as f:
        json.dump(metadata, f)

    print(f"\nAdded: {added} sites")
    print(f"Total sites: {metadata['total_sites']}")
    print(f"Sites with embeddings: {metadata['sites_with_embeddings']}")
    print(f"\nBy country:")
    for country, count in sorted(by_country.items(), key=lambda x: -x[1]):
        print(f"  {country}: {count}")
    print(f"\nSaved to {V6_PATH}")


if __name__ == '__main__':
    main()
