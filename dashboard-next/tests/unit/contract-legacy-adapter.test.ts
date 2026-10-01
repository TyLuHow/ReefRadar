import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContractSitesFile } from '@/features/contract/schema';
import { toLegacySitesResponse } from '@/features/contract/legacy';
import { REPO_ROOT, readContractJson } from './support/contract-fetch';

/**
 * 02-07: the adapter that lets unchanged legacy pages read the contract.
 * Parity target: the frozen legacy API response (tests/fixtures/api/sites.json).
 */

type LegacyFixtureSite = Record<string, unknown> & { site_id: string };

const apiFixture = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'dashboard-next', 'tests', 'fixtures', 'api', 'sites.json'), 'utf-8')
) as { sites: LegacyFixtureSite[] };
const coordinates = readContractJson('contracts/fixtures/legacy-site-coordinates.json') as Record<
  string,
  { location: string }
>;
const contractSites = ContractSitesFile.parse(readContractJson('contracts/bucket/v1/sites.json')).sites;

describe('toLegacySitesResponse', () => {
  const legacy = toLegacySitesResponse(contractSites);

  it('reports counts computed from the data', () => {
    expect(legacy.count).toBe(54);
    expect(legacy.total_sites).toBe(54);
    expect(legacy.sites_with_embeddings).toBe(48);
    expect(legacy.sites).toHaveLength(54);
  });

  it('deep-equals the frozen API fixture sites, minus synthetic and plus location, in the same order', () => {
    const expected = apiFixture.sites.map((site) => {
      const { synthetic: _synthetic, ...rest } = site;
      const location =
        site.site_id === 'irma_eastern_sambo' ? 'Florida Keys, USA' : coordinates[site.site_id]?.location;
      expect(location, `no expected location for ${site.site_id}`).toBeTruthy();
      return { ...rest, location };
    });
    expect(legacy.sites).toStrictEqual(expected);
  });

  it('never carries the synthetic key or a contract-only field into the legacy shape', () => {
    for (const site of legacy.sites) {
      expect(site).not.toHaveProperty('synthetic');
      expect(site).not.toHaveProperty('embedding_row');
      expect(site).not.toHaveProperty('projection');
      expect(site).not.toHaveProperty('licence');
    }
  });

  it('marks has_embedding from reference_role', () => {
    const byId = new Map(contractSites.map((s) => [s.site_id, s]));
    for (const site of legacy.sites) {
      expect(site.has_embedding).toBe(byId.get(site.site_id)?.reference_role === 'acoustic_reference');
    }
  });
});
