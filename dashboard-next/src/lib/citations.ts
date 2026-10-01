// Canonical citations module (TRUTH-08 / D-19).
//
// Single source of truth for every dataset and model-paper citation used
// anywhere in ReefRadar. Reads dashboard-next/src/data/citations.json —
// the same file scripts/check-citations.mjs validates and renders into
// docs/CITATIONS.md. Do not hardcode citation text elsewhere; import from
// this module.

import citationsData from '@/data/citations.json';

export interface RelatedCitation {
  label: string;
  doi?: string;
  url?: string;
}

export interface CitationRecord {
  id: string;
  kind: 'dataset' | 'paper';
  title: string;
  authors: string[];
  year: number | null;
  publisher: string;
  doi: string | null;
  url: string;
  licence: string;
  licence_url: string | null;
  short: string;
  related: RelatedCitation[];
  verified_from: string;
  verification_note: string | null;
}

interface CitationsFile {
  schema_version: number;
  verified_at: string;
  citations: Record<string, CitationRecord>;
}

const data = citationsData as unknown as CitationsFile;

/** All canonical citation records, keyed by id (marrs, surfperch, irma, coralsoundexplorer, sanctsound). */
export const CITATIONS: Record<string, CitationRecord> = data.citations;

/** Look up a citation record by id. Throws if the id is unknown. */
export function getCitation(id: string): CitationRecord {
  const citation = CITATIONS[id];
  if (!citation) {
    throw new Error(`Unknown citation id: "${id}". Known ids: ${Object.keys(CITATIONS).join(', ')}`);
  }
  return citation;
}

export type CitationStyle = 'short' | 'apa' | 'bibtex';

/** Format a citation record in the requested style. */
export function formatCitation(id: string, style: CitationStyle): string {
  const record = getCitation(id);
  switch (style) {
    case 'short':
      return record.short;
    case 'apa':
      return formatApa(record);
    case 'bibtex':
      return formatBibtex(record);
    default: {
      const exhaustive: never = style;
      throw new Error(`Unknown citation style: ${exhaustive}`);
    }
  }
}

function formatApa(record: CitationRecord): string {
  const authors = record.authors.join(', ');
  const year = record.year ?? 'n.d.';
  const link = record.doi ? `https://doi.org/${record.doi}` : record.url;
  return `${authors} (${year}). ${record.title}. ${record.publisher}. ${link}`;
}

function bibtexKey(record: CitationRecord): string {
  const firstAuthorLastName = record.authors[0]?.split(' ').pop()?.toLowerCase() ?? record.id;
  return `${firstAuthorLastName}${record.year ?? ''}`;
}

function formatBibtex(record: CitationRecord): string {
  const entryType = record.kind === 'paper' ? 'article' : 'misc';
  const authors = record.authors.join(' and ');
  const lines = [
    `@${entryType}{${bibtexKey(record)},`,
    `  title = {${record.title}},`,
    `  author = {${authors}},`,
  ];
  if (record.year !== null) lines.push(`  year = {${record.year}},`);
  lines.push(`  publisher = {${record.publisher}},`);
  if (record.doi) lines.push(`  doi = {${record.doi}},`);
  lines.push(`  url = {${record.url}},`);
  lines.push('}');
  return lines.join('\n');
}
