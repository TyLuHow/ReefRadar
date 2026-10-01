// Who assigned a similar site's label (D-17/TRUTH-09). One helper so every
// surface that lists similar reference sites states the label's source the
// same way instead of presenting a bare "Healthy"/"Degraded".

import { CITATIONS } from '@/lib/citations';
import type { SimilarSite } from '@/types';

/** Display name of the dataset that assigned the label. Prefers the API's own `label_source_name`. */
export function labelSourceDisplayName(site: Pick<SimilarSite, 'label_source' | 'label_source_name'>): string | null {
  if (site.label_source_name) return site.label_source_name;
  if (!site.label_source) return null;
  return CITATIONS[site.label_source]?.short ?? site.label_source;
}

/**
 * "label: Healthy (H) (assigned by MARRS ...)" when the dataset assigned a
 * label, "no health label assigned by Hurricane Irma ..." when the source is
 * known but the dataset assigns none (Irma, SanctSound), or null when the API
 * (an older response) carries no provenance at all -- in which case callers
 * must not present the status as a dataset label.
 */
export function similarSiteLabelText(
  site: Pick<SimilarSite, 'label_source' | 'label_source_name' | 'label_original'>
): string | null {
  const source = labelSourceDisplayName(site);
  if (!source) return null;
  return site.label_original
    ? `label: ${site.label_original} (assigned by ${source})`
    : `no health label assigned by ${source}`;
}
