// Derives every site/country/category count shown in the UI from a real
// GET /sites response (D-18/TRUTH-07). No page may hard-code 54/7/4 or any
// other site-derived number; every surface computes it here instead.

import { SitesResponse } from '@/types';

export interface SiteStats {
  /** Total sites returned by /sites. */
  total: number;
  /** Distinct countries, sorted alphabetically. */
  countries: string[];
  /** countries.length, for convenience. */
  countryCount: number;
  /** Sites with a real acoustic embedding (has_embedding === true). */
  acousticReference: number;
  /** Count of sites per status, including 'unknown'. */
  byStatus: Record<string, number>;
  /** Distinct non-unknown statuses actually present -- dataset label categories, not model classes. */
  labelCategories: string[];
  /** labelCategories.length, for convenience. */
  labelCategoryCount: number;
  /** Distinct dataset display names present (label_source_name), sorted alphabetically. */
  datasetNames: string[];
}

export function deriveSiteStats(sitesResponse: SitesResponse | null | undefined): SiteStats {
  const sites = sitesResponse?.sites ?? [];

  const total = sites.length;

  const countries = Array.from(new Set(sites.map((s) => s.country).filter(Boolean))).sort();

  const acousticReference = sites.filter((s) => s.has_embedding === true).length;

  const byStatus: Record<string, number> = {};
  for (const site of sites) {
    byStatus[site.status] = (byStatus[site.status] ?? 0) + 1;
  }

  const labelCategories = Array.from(
    new Set(sites.map((s) => s.status).filter((status) => status !== 'unknown'))
  ).sort();

  const datasetNames = Array.from(
    new Set(sites.map((s) => s.label_source_name).filter((name): name is string => Boolean(name)))
  ).sort();

  return {
    total,
    countries,
    countryCount: countries.length,
    acousticReference,
    byStatus,
    labelCategories,
    labelCategoryCount: labelCategories.length,
    datasetNames,
  };
}

/** "A, B and C" / "A and B" / "A" -- used for honest derived-count sentences. */
export function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
