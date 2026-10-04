/**
 * Link safety for provenance (04-12, T-04-12-01). Dataset, DOI and licence URLs come from the
 * contract's data files and become `href`s, so none of them is trusted: a value is a link only when
 * it parses as an absolute `https:` URL (no `javascript:`, `data:`, `http:`, protocol-relative or
 * relative value, and no embedded credentials). Anything else is shown as text by the caller.
 */

/** The parsed URL's text for an absolute https URL; `undefined` for anything else. */
export function safeHttpsUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  return url.href;
}

/**
 * `https://doi.org/{doi}`. Each path segment is encoded (a DOI may contain characters that mean
 * something in a URL, such as `?` or `#`); the slashes that separate the prefix from the suffix stay.
 */
export function doiUrl(doi: string): string {
  const path = doi
    .trim()
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://doi.org/${path}`;
}
