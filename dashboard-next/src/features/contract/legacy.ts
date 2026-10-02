'use client';

import { useMemo } from 'react';
import type { Site, SitesResponse } from '@/types';
import { useReferenceSites } from './hooks';
import type { ContractSite } from './schema';

/**
 * Adapter that lets the legacy pages keep reading the old /sites response
 * shape while the contract is the only source of the data (02-07). Retired
 * with the legacy routes once every capability is rehomed (CAPABILITY-MATRIX).
 */

function toLegacySite(site: ContractSite): Site {
  return {
    site_id: site.site_id,
    country: site.country,
    status: site.status,
    latitude: site.latitude,
    longitude: site.longitude,
    location: site.location_label,
    has_embedding: site.reference_role === 'acoustic_reference',
    region: site.region,
    source: site.dataset_name,
    label_source: site.dataset_id,
    label_source_name: site.label_source_name,
    label_assigned_by: site.label_assigned_by,
    label_original: site.label_original,
    label_definition: site.label_definition,
    status_basis: site.status_basis,
    period: site.period,
    label_note: site.label_note,
  };
}

/** Map contract sites to the legacy /sites response; counts are computed from the data. */
export function toLegacySitesResponse(sites: readonly ContractSite[]): SitesResponse {
  const mapped = sites.map(toLegacySite);
  return {
    sites: mapped,
    count: mapped.length,
    total_sites: mapped.length,
    sites_with_embeddings: mapped.filter((site) => site.has_embedding).length,
  };
}

export interface LegacySitesResult {
  data: SitesResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Drop-in replacement for the retired client query of the backend /sites endpoint. */
export function useLegacySitesResponse(): LegacySitesResult {
  const { data: sites, isLoading, error, refetch } = useReferenceSites();
  const data = useMemo(() => (sites ? toLegacySitesResponse(sites) : undefined), [sites]);
  return { data, isLoading, error, refetch };
}

export interface SiteIndexEntry {
  lat: number;
  lon: number;
  location: string;
}

export interface SiteIndexResult {
  data: Record<string, SiteIndexEntry> | undefined;
  isLoading: boolean;
  error: Error | null;
}

/** Contract sites keyed by site_id, for components that look up a coordinate by id (the analysis mini map). */
export function useSiteIndex(): SiteIndexResult {
  const { data: sites, isLoading, error } = useReferenceSites();
  const data = useMemo(() => {
    if (!sites) return undefined;
    const index: Record<string, SiteIndexEntry> = {};
    for (const site of sites) {
      index[site.site_id] = { lat: site.latitude, lon: site.longitude, location: site.location_label };
    }
    return index;
  }, [sites]);
  return { data, isLoading, error };
}
