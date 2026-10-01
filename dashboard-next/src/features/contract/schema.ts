import { z } from 'zod';

/**
 * Hand-mirrored Zod schemas for the data contract (02-07).
 *
 * The JSON Schemas under contracts/schema/ are the source of truth. This file
 * mirrors them by hand (owner decision, 02-CONTEXT "Schema and versioning");
 * tests/unit/contract-schema-parity.test.ts holds the mirror to the same
 * verdicts as Python's jsonschema over contracts/fixtures/parity-corpus.json
 * and to the same property and required sets, so the two cannot drift apart
 * silently.
 *
 * Every object is z.looseObject (or an object with a catchall): unknown keys
 * are kept, never stripped, which is what makes "additive-only" schema growth
 * safe for older app builds.
 *
 * Each `*Base` export is the plain object (for structural comparison with the
 * JSON Schema); the un-suffixed export adds the JSON Schema if/then invariants.
 * Regular expressions are copied verbatim from the JSON Schemas.
 */

// ---- shared patterns ------------------------------------------------------

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_STRING_PATTERN = /^[a-z0-9][a-z0-9.+-]*$/;
/** Path relative to the contract base URL: contract/... or v<N>/..., never absolute, never a URL, never '..'. */
export const ARTIFACT_URI_PATTERN = /^(contract|v[0-9]+)\/(?!.*\.\.)[A-Za-z0-9_./-]+$/;
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const HTTPS_URL_PATTERN = /^https:\/\/\S+$/;

const sha256 = z.string().regex(SHA256_PATTERN);
const versionString = z.string().regex(VERSION_STRING_PATTERN);
const nonEmpty = z.string().min(1);
const nonNegativeInt = z.number().int().min(0);
const positiveInt = z.number().int().min(1);

// ---- pointer (contract/latest.json) --------------------------------------

export const ContractPointerBase = z.looseObject({
  contract_version: positiveInt,
  manifest_uri: z.string().regex(/^contract\/v[0-9]+\.json$/),
  manifest_sha256: sha256,
});
export const ContractPointer = ContractPointerBase;

// ---- manifest (contract/v<N>.json) ---------------------------------------

export const CoverageBase = z.looseObject({
  has_diel: z.boolean(),
  has_detections: z.boolean(),
  has_pre_post_event: z.boolean(),
  has_effort: z.boolean(),
  total_sites: nonNegativeInt,
  sites_with_embeddings: nonNegativeInt,
  countries: nonNegativeInt,
});
export const Coverage = CoverageBase;

export const PresentArtifactBase = z.looseObject({
  uri: z.string().regex(ARTIFACT_URI_PATTERN),
  sha256,
  bytes: nonNegativeInt,
  content_type: nonEmpty,
  count: nonNegativeInt.optional(),
});
export const PresentArtifact = PresentArtifactBase;

/** Exactly {"present": false}. */
export const AbsentArtifactBase = z.looseObject({ present: z.literal(false) });
export const AbsentArtifact = AbsentArtifactBase.superRefine((value, ctx) => {
  if (Object.keys(value).length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'an absent artifact is exactly {"present": false}' });
  }
});

const ArtifactOrAbsent = z.union([PresentArtifact, AbsentArtifact]);

export const EmbeddingsArtifactBase = PresentArtifactBase.extend({
  count: positiveInt,
  dtype: z.literal('float32-le'),
  dim: positiveInt,
  row_site_ids: z.array(nonEmpty),
});
export const EmbeddingsArtifact = EmbeddingsArtifactBase.superRefine((value, ctx) => {
  if (new Set(value.row_site_ids).size !== value.row_site_ids.length) {
    ctx.addIssue({ code: 'custom', message: 'row_site_ids must be unique', path: ['row_site_ids'] });
  }
});

export const ProjectionArtifactBase = PresentArtifactBase.extend({
  method: z.literal('pca'),
  explained_variance_ratio: z.array(z.number()),
});
export const ProjectionArtifact = ProjectionArtifactBase;

export const ManifestArtifactsBase = z
  .object({
    sites: ArtifactOrAbsent,
    model_version: ArtifactOrAbsent,
    preprocessing_spec: ArtifactOrAbsent,
    stamp: ArtifactOrAbsent,
    schemas: z.record(z.string(), PresentArtifact),
    aggregates_diel: ArtifactOrAbsent,
    aggregates_effort: ArtifactOrAbsent,
    detections: ArtifactOrAbsent,
    embeddings: EmbeddingsArtifact,
    projection: ProjectionArtifact,
  })
  .catchall(ArtifactOrAbsent);

export const DatasetBase = z.looseObject({
  id: nonEmpty,
  name: nonEmpty,
  title: z.string().optional(),
  doi: z.string().regex(DOI_PATTERN).nullable(),
  doi_note: z.string().nullable(),
  url: z.string().regex(HTTPS_URL_PATTERN),
  licence: nonEmpty,
  licence_url: z.string().regex(HTTPS_URL_PATTERN).nullable(),
});

export const ContractManifestBase = z.looseObject({
  schema_version: z.literal(1),
  contract_version: positiveInt,
  frozen_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  dataset_version: versionString,
  model_version: versionString,
  preprocessing_spec_version: versionString,
  fixture: z.boolean().optional(),
  coverage: Coverage,
  artifacts: ManifestArtifactsBase,
  datasets: z.array(DatasetBase),
  sources: z.record(z.string(), z.unknown()),
});
export const ContractManifest = ContractManifestBase;

// ---- sites (v<N>/sites.json) ---------------------------------------------

export const SITE_STATUSES = ['healthy', 'degraded', 'restored_early', 'restored_mid', 'unknown'] as const;
export const REFERENCE_ROLES = ['acoustic_reference', 'location_only'] as const;

export const ContractSiteBase = z.looseObject({
  site_id: nonEmpty,
  country: nonEmpty,
  region: nonEmpty,
  location_label: nonEmpty,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status: z.enum(SITE_STATUSES),
  reference_role: z.enum(REFERENCE_ROLES),
  dataset_id: nonEmpty,
  dataset_name: nonEmpty,
  doi: z.string().regex(DOI_PATTERN).nullable(),
  doi_note: z.string().nullable(),
  dataset_url: z.string().regex(HTTPS_URL_PATTERN),
  licence: nonEmpty,
  licence_url: z.string().regex(HTTPS_URL_PATTERN).nullable(),
  label_source_name: nonEmpty,
  label_assigned_by: nonEmpty,
  label_original: z.string().nullable(),
  label_definition: z.string().nullable(),
  status_basis: z.string().nullable(),
  period: z.string().nullable(),
  label_note: z.string().nullable(),
  synthetic: z.literal(false),
  embedding_row: nonNegativeInt.nullable(),
  projection: z.looseObject({ x: z.number(), y: z.number() }).nullable(),
});

/** The four JSON Schema if/then invariants (site.schema.json allOf). */
export const ContractSite = ContractSiteBase.superRefine((site, ctx) => {
  // A site whose dataset gives no label definition has no health status; the reason must be stated.
  if (site.label_definition === null) {
    if (site.status !== 'unknown') {
      ctx.addIssue({ code: 'custom', message: 'a site with no label definition must have status "unknown"', path: ['status'] });
    }
    if (typeof site.status_basis !== 'string' || site.status_basis.length < 1) {
      ctx.addIssue({ code: 'custom', message: 'status_basis must state why the status is unknown', path: ['status_basis'] });
    }
  }
  // A dataset without a DOI states why; a DOI is never invented.
  if (site.doi === null && (typeof site.doi_note !== 'string' || site.doi_note.length < 1)) {
    ctx.addIssue({ code: 'custom', message: 'doi_note must explain a null doi', path: ['doi_note'] });
  }
  // An acoustic reference site has an embedding row and a projection point.
  if (site.reference_role === 'acoustic_reference') {
    if (site.embedding_row === null) {
      ctx.addIssue({ code: 'custom', message: 'an acoustic reference site has an embedding row', path: ['embedding_row'] });
    }
    if (site.projection === null) {
      ctx.addIssue({ code: 'custom', message: 'an acoustic reference site has a projection', path: ['projection'] });
    }
  }
  // A location-only site has no embedding, so both fields are null.
  if (site.reference_role === 'location_only') {
    if (site.embedding_row !== null) {
      ctx.addIssue({ code: 'custom', message: 'a location-only site has no embedding row', path: ['embedding_row'] });
    }
    if (site.projection !== null) {
      ctx.addIssue({ code: 'custom', message: 'a location-only site has no projection', path: ['projection'] });
    }
  }
});

/** The sites artifact: {schema_version, sites}. */
export const ContractSitesFile = z.looseObject({
  schema_version: z.literal(1),
  sites: z.array(ContractSite),
});

// ---- inferred types -------------------------------------------------------

export type ContractPointer = z.infer<typeof ContractPointer>;
export type Coverage = z.infer<typeof Coverage>;
export type PresentArtifact = z.infer<typeof PresentArtifact>;
export type AbsentArtifact = z.infer<typeof AbsentArtifact>;
export type ContractManifest = z.infer<typeof ContractManifest>;
export type ContractSite = z.infer<typeof ContractSite>;
export type ContractSitesFile = z.infer<typeof ContractSitesFile>;
