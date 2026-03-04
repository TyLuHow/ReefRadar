#!/usr/bin/env python3
"""
Add 3 new Hurricane Irma sites to metadata_v6.json.

Removes the old irma_eastern_sambo (location-only) entry and adds:
- irma_western_dry_rocks_pre (WDR July 2017, before Hurricane Irma)
- irma_eastern_sambo_pre (ESB July 2017, before Hurricane Irma)
- irma_eastern_sambo_post (ESB October 2017, after Hurricane Irma)

Net change: -1 + 3 = +2 sites (54 -> 56 total)

Usage:
    python3 scripts/add_irma_sites.py
"""

import json
from pathlib import Path
import time

METADATA_PATH = Path('data/embeddings/metadata_v6.json')

NEW_SITES = [
    {
        'site_id': 'irma_western_dry_rocks_pre',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.4468,
        'longitude': -81.9275,
        'has_embedding': False,
        'embedding': None,
        'source': 'dryad_irma',
        'doi': '10.5061/dryad.5tb2rbp38',
    },
    {
        'site_id': 'irma_eastern_sambo_pre',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.4915,
        'longitude': -81.6625,
        'has_embedding': False,
        'embedding': None,
        'source': 'dryad_irma',
        'doi': '10.5061/dryad.5tb2rbp38',
    },
    {
        'site_id': 'irma_eastern_sambo_post',
        'country': 'USA',
        'region': 'Florida Keys',
        'status': 'unknown',
        'latitude': 24.4915,
        'longitude': -81.6625,
        'has_embedding': False,
        'embedding': None,
        'source': 'dryad_irma',
        'doi': '10.5061/dryad.5tb2rbp38',
    },
]


def main():
    # Load metadata
    with open(METADATA_PATH) as f:
        metadata = json.load(f)

    print(f"Loaded metadata: {len(metadata['sites'])} sites")

    # Remove irma_eastern_sambo (location-only placeholder)
    original_count = len(metadata['sites'])
    metadata['sites'] = [s for s in metadata['sites'] if s['site_id'] != 'irma_eastern_sambo']
    removed = original_count - len(metadata['sites'])
    print(f"Removed irma_eastern_sambo: {removed} site(s)")

    # Add new sites
    existing_ids = {s['site_id'] for s in metadata['sites']}
    added = 0
    for site in NEW_SITES:
        if site['site_id'] not in existing_ids:
            metadata['sites'].append(site)
            existing_ids.add(site['site_id'])
            added += 1
            print(f"  Added: {site['site_id']}")
        else:
            print(f"  SKIP duplicate: {site['site_id']}")

    # Update metadata counts
    metadata['total_sites'] = len(metadata['sites'])
    metadata['generated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ')
    metadata['sites_with_embeddings'] = sum(
        1 for s in metadata['sites']
        if s.get('has_embedding', True) and len(s.get('embedding', []) or []) > 0
    )
    metadata['sources'] = sorted(set(
        s.get('source', 'MARRS') for s in metadata['sites']
    ))

    # Validate
    all_ids = [s['site_id'] for s in metadata['sites']]
    assert len(all_ids) == len(set(all_ids)), "Duplicate site_ids found!"
    for s in metadata['sites']:
        assert s.get('latitude') is not None, f"{s['site_id']} missing latitude"
        assert s.get('longitude') is not None, f"{s['site_id']} missing longitude"

    # Count by country
    by_country = {}
    for site in metadata['sites']:
        c = site.get('country', 'Unknown')
        by_country[c] = by_country.get(c, 0) + 1

    # Save
    with open(METADATA_PATH, 'w') as f:
        json.dump(metadata, f)

    print(f"\n=== Summary ===")
    print(f"Removed: {removed}, Added: {added}")
    print(f"Total sites: {metadata['total_sites']}")
    print(f"Sites with embeddings: {metadata['sites_with_embeddings']}")
    print(f"\nBy country:")
    for country, count in sorted(by_country.items(), key=lambda x: -x[1]):
        print(f"  {country}: {count}")
    print(f"\nSaved to {METADATA_PATH}")


if __name__ == '__main__':
    main()
