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

export const SiteProjectionBase = z.looseObject({ x: z.number(), y: z.number() });

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
  projection: SiteProjectionBase.nullable(),
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

// ---- model version (v<N>/model_version.json) ------------------------------

export const EmbeddingModelBase = z.looseObject({
  name: nonEmpty,
  version: nonEmpty,
  dimension: positiveInt,
});
export const EmbeddingModel = EmbeddingModelBase;

export const ModelArchitectureBase = z.looseObject({
  input_dim: positiveInt,
  hidden_dims: z.array(positiveInt),
  num_classes: positiveInt,
});

export const ModelTrainingBase = z.looseObject({
  rows: nonNegativeInt,
  sites: z.array(nonEmpty),
  countries: z.array(nonEmpty),
  synthetic_data: z.literal(false),
  synthetic_rows_excluded: nonNegativeInt,
  seed: z.number().int(),
  // 05-06: the spec the model was trained under; the checker holds it equal to the served spec.
  preprocessing_spec_version: versionString.optional(),
  embedding_source: nonEmpty.optional(),
});

export const ModelPredecessorBase = z.looseObject({
  model_version: nonEmpty,
  retired_reason: nonEmpty,
});

export const ModelVersionBase = z.looseObject({
  schema_version: z.literal(1),
  model_version: versionString,
  architecture: ModelArchitectureBase,
  classes: z.array(nonEmpty).min(1),
  embedding_model: EmbeddingModelBase,
  preprocessing_spec_version: versionString,
  training: ModelTrainingBase,
  // Null unless a grouped, site-held-out evaluation exists; no accuracy figure is carried.
  evaluation: z.record(z.string(), z.unknown()).nullable(),
  evaluation_note: nonEmpty,
  config_sha256: sha256,
  config_sha256_deployed: sha256.optional(),
  weights_sha256: sha256,
  weights_location: z.string().regex(/^s3:\/\/[a-z0-9.-]+\/\S+$/),
  predecessor: ModelPredecessorBase,
  served_from: nonEmpty.optional(),
});
export const ModelVersion = ModelVersionBase;

// ---- preprocessing spec (v<N>/preprocessing_spec.json) --------------------

export const ResamplingBase = z.looseObject({
  method: nonEmpty,
  anti_alias_filter: z.boolean(),
  kaiser_beta: z.number().optional(),
  half_length_factor: z.number().int().optional(),
  cutoff: z.string().optional(),
  reference_implementation: z.string().optional(),
});

export const KnownGapBase = z.looseObject({
  id: nonEmpty,
  summary: nonEmpty,
  owner_phase: nonEmpty,
  status: nonEmpty,
  reference: nonEmpty,
  evidence: z.array(nonEmpty).optional(),
  closed_by: nonEmpty.optional(),
});

export const ModelPinFileBase = z.looseObject({
  path: nonEmpty,
  bytes: nonNegativeInt,
  sha256,
});

export const ModelPinBase = z.looseObject({
  kaggle_handle: nonEmpty,
  files: z.array(ModelPinFileBase),
});

export const ServingBase = z.looseObject({ window_pooling: nonEmpty });

export const PreprocessingSpecBase = z.looseObject({
  schema_version: z.literal(1),
  spec_version: versionString,
  status: nonEmpty,
  sample_rate_hz: positiveInt,
  window_s: z.number().gt(0),
  window_samples: positiveInt,
  hop_s: z.number().gt(0),
  min_duration_s: z.number().min(0),
  max_duration_s: z.number().min(0),
  trailing_partial_window: nonEmpty,
  channel_mix: nonEmpty,
  amplitude_scaling: z.record(z.string(), z.unknown()),
  resampling: ResamplingBase,
  embedding_model: EmbeddingModelBase,
  serving: ServingBase,
  known_gaps: z.array(KnownGapBase).min(1),
  source: nonEmpty,
  model_pin: ModelPinBase.optional(),
  supported_input: z.record(z.string(), z.unknown()).optional(),
  levels: nonEmpty.optional(),
});
export const PreprocessingSpec = PreprocessingSpecBase.superRefine((value, ctx) => {
  if (Object.keys(value.amplitude_scaling).length < 1) {
    ctx.addIssue({ code: 'custom', message: 'amplitude_scaling must describe the scaling', path: ['amplitude_scaling'] });
  }
});

// ---- projection (v<N>/projection.json) ------------------------------------

export const ProjectionCoordinateBase = z.looseObject({
  site_id: nonEmpty,
  x: z.number(),
  y: z.number(),
});

export const ProjectionBase = z.looseObject({
  schema_version: z.literal(1),
  method: z.literal('pca'),
  input_uri: z.string().regex(/^v[0-9]+\/[A-Za-z0-9_./-]+$/),
  site_ids: z.array(nonEmpty),
  mean: z.array(z.number()),
  components: z.array(z.array(z.number())),
  explained_variance: z.array(z.number()),
  explained_variance_ratio: z.array(z.number()),
  cumulative_explained_variance_ratio: z.number().min(0).max(1),
  coordinates: z.array(ProjectionCoordinateBase),
  sign_rule: nonEmpty,
  note: nonEmpty,
});
// Array lengths are verified by scripts/check_contract.py, not by the JSON Schema, so not here either.
export const Projection = ProjectionBase;

// ---- analysis result version stamp and per-window keys ---------------------

const nonNegativeNumber = z.number().min(0);
const cosine = z.number().min(-1).max(1);
const probability = z.number().min(0).max(1);
const numberPair = z.array(z.number()).length(2);

/** Per-window classifier output; every array has one entry per window, probabilities one column per class. */
export const ResultWindowsBase = z.looseObject({
  count: positiveInt,
  window_s: z.number().gt(0),
  index: z.array(nonNegativeInt),
  start_s: z.array(nonNegativeNumber),
  classes: z.array(nonEmpty).min(1),
  probabilities: z.record(z.string(), z.array(probability)),
  label: z.array(z.string()),
  peak_dbfs: z.array(z.number()),
  rms_dbfs: z.array(z.number()),
  silent: z.array(z.boolean()),
  nearest_site: z.array(z.string()).optional(),
  similarities: z.array(z.array(cosine)).optional(),
});

export const SiteSimilarityBase = z.looseObject({
  site_id: nonEmpty,
  has_embedding: z.boolean(),
  similarity: cosine.nullable(),
  rank: positiveInt.nullable(),
});

export const SiteSimilaritiesBase = z.looseObject({
  metric: z.literal('cosine'),
  aggregation: z.literal('mean_of_window_cosines'),
  contract_version: positiveInt,
  dataset_version: versionString,
  site_order: z.array(nonEmpty),
  sites: z.array(SiteSimilarityBase),
  note: z.string().optional(),
});

export const ResultProjectionBase = z.looseObject({
  method: z.literal('pca'),
  contract_version: positiveInt,
  explained_variance_ratio: z.array(z.number()),
  windows: z.array(numberPair),
  centroid: numberPair,
  note: nonEmpty,
  basis_uri: z.string().regex(/^v[0-9]+\/[A-Za-z0-9_./-]+$/).optional(),
});

export const OodWindowsBase = z.looseObject({
  distance: z.array(nonNegativeNumber),
  status: z.array(z.enum(['inside', 'outside'])),
});

export const OodSummaryBase = z.looseObject({
  windows_outside: nonNegativeInt,
  windows_total: positiveInt,
  statement: nonEmpty,
});

export const OodBase = z.looseObject({
  metric: z.literal('cosine_distance_to_nearest_training_window'),
  k: z.literal(1),
  threshold: nonNegativeNumber,
  reference_version: versionString,
  reference_sha256: sha256,
  windows: OodWindowsBase,
  summary: OodSummaryBase,
  note: z.string(),
});

export const InputAudioBase = z.looseObject({
  sample_rate_hz: positiveInt,
  channels: positiveInt,
  bits_per_sample: positiveInt,
  encoding: z.enum(['pcm', 'float']),
  duration_s: nonNegativeNumber,
  windows: positiveInt,
  dropped_tail_s: nonNegativeNumber,
  preprocessing_spec_version: versionString,
});

export const AnalysisResultStampBase = z.looseObject({
  contract_version: positiveInt.nullable(),
  dataset_version: versionString.nullable(),
  model_version: versionString.nullable(),
  preprocessing_spec_version: versionString.nullable(),
  // From contract v2 (05-06): all optional, so legacy and stamp-only results stay valid.
  stamp_status: z.enum(['stamped', 'uncovered', 'load_failed']).optional(),
  windows: ResultWindowsBase.optional(),
  site_similarities: SiteSimilaritiesBase.optional(),
  projection: ResultProjectionBase.optional(),
  ood: OodBase.optional(),
  input_audio: InputAudioBase.optional(),
});
/**
 * A pre-contract result (null contract_version) carries no dataset or preprocessing-spec version.
 * A site without an embedding has no similarity and no rank (the JSON Schema's if/then on site_similarity).
 */
export const AnalysisResultStamp = AnalysisResultStampBase.superRefine((stamp, ctx) => {
  if (stamp.contract_version === null) {
    if (stamp.dataset_version !== null) {
      ctx.addIssue({ code: 'custom', message: 'a pre-contract result has no dataset_version', path: ['dataset_version'] });
    }
    if (stamp.preprocessing_spec_version !== null) {
      ctx.addIssue({ code: 'custom', message: 'a pre-contract result has no preprocessing_spec_version', path: ['preprocessing_spec_version'] });
    }
  }
  stamp.site_similarities?.sites.forEach((site, index) => {
    if (site.has_embedding === false) {
      if (site.similarity !== null) {
        ctx.addIssue({ code: 'custom', message: 'a site without an embedding has no similarity', path: ['site_similarities', 'sites', index, 'similarity'] });
      }
      if (site.rank !== null) {
        ctx.addIssue({ code: 'custom', message: 'a site without an embedding has no rank', path: ['site_similarities', 'sites', index, 'rank'] });
      }
    }
  });
});

// ---- evaluation report (05-06) --------------------------------------------

const gitSha = z.string().regex(/^[0-9a-f]{40}$/);
const nullableNumber = z.number().nullable();

export const EvaluationGeneratedByBase = z.looseObject({ script: nonEmpty, git_sha: gitSha });

export const EvaluationInputBase = z.looseObject({
  name: nonEmpty,
  path: nonEmpty,
  sha256,
  rows: nonNegativeInt,
});

export const EvaluationTrainerBase = z.looseObject({
  script: nonEmpty,
  git_sha: gitSha,
  seed: z.number().int(),
  recipe_note: nonEmpty,
});

export const EvaluationBootstrapBase = z.looseObject({
  B: positiveInt,
  levels: z.literal(2),
  seed: z.number().int(),
  rng: nonEmpty,
  numpy_version: nonEmpty,
  interval: z.literal('percentile_95'),
  min_sites_for_interval: z.literal(2),
});

export const EvaluationMetricBase = z.looseObject({
  value: nullableNumber,
  ci_low: nullableNumber,
  ci_high: nullableNumber,
  ci_status: z.enum(['estimated', 'not_estimable_1_site', 'undefined']),
  n_sites: nonNegativeInt,
  n_windows: nonNegativeInt,
  defined_fraction: z.number().min(0).max(1).nullable(),
});

export const EvaluationFoldBase = z.looseObject({
  held_out_site: nonEmpty,
  country: nonEmpty,
  true_class: nonEmpty,
  train_sites: z.array(nonEmpty),
  train_classes: z.array(nonEmpty),
  n_test: nonNegativeInt,
  evaluable: z.boolean(),
  reason: z.string().nullable(),
  correct: z.number().int().nullable(),
  predicted_distribution: z.record(z.string(), nonNegativeInt),
});

export const EvaluationPredictionBase = z.looseObject({
  file_id: nonEmpty,
  site_id: nonEmpty,
  true_label: nonEmpty,
  predicted_label: nonEmpty,
  probabilities: z.record(z.string(), probability),
});

export const EvaluatedModelMetricsBase = z.looseObject({
  per_class: z.record(z.string(), EvaluationMetricBase),
  per_region: z.record(z.string(), EvaluationMetricBase),
  balanced_accuracy: EvaluationMetricBase,
});

export const EvaluatedModelBaselinesBase = z.looseObject({
  training_majority: EvaluationMetricBase,
  uniform_random: EvaluationMetricBase,
});

export const EvaluatedModelBase = z.looseObject({
  model_version: versionString,
  embeddings: z.enum(['original', 'reembedded']),
  preprocessing_spec_version: versionString,
  served: z.boolean(),
  folds: z.array(EvaluationFoldBase),
  predictions: z.array(EvaluationPredictionBase),
  metrics: EvaluatedModelMetricsBase,
  baselines: EvaluatedModelBaselinesBase,
});

export const DriftProbeCosineBase = z.looseObject({
  mean: z.number(),
  median: z.number(),
  min: z.number(),
  max: z.number(),
});

export const DriftProbeBase = z.looseObject({
  pairs: nonNegativeInt,
  cosine: DriftProbeCosineBase,
  note: nonEmpty,
});

export const InvalidatedFigureBase = z.looseObject({
  figure: nonEmpty,
  value: z.string(),
  source: nonEmpty,
  reason: nonEmpty,
});

export const EvaluationReportBase = z.looseObject({
  schema_version: z.literal(1),
  report_version: versionString,
  method: z.literal('leave_one_site_out'),
  generated_by: EvaluationGeneratedByBase,
  inputs: z.array(EvaluationInputBase),
  trainer: EvaluationTrainerBase,
  bootstrap: EvaluationBootstrapBase,
  models: z.array(EvaluatedModelBase).min(1),
  served_model_version: versionString,
  drift_probe: DriftProbeBase,
  invalidated_figures: z.array(InvalidatedFigureBase),
  caveats: z.array(nonEmpty).min(1),
});
export const EvaluationReport = EvaluationReportBase;

// ---- OOD reference (05-06) ------------------------------------------------

export const OodCalibrationSiteBase = z.looseObject({
  site_id: nonEmpty,
  n: nonNegativeInt,
  p50: nonNegativeNumber,
  p95: nonNegativeNumber,
  max: nonNegativeNumber,
});

export const OodCalibrationBase = z.looseObject({
  method: z.literal('leave_one_site_out_nearest_neighbour'),
  percentile: z.literal(95),
  pooled_n: nonNegativeInt,
  per_site: z.array(OodCalibrationSiteBase),
});

export const OodEmbeddingsBase = z.looseObject({
  uri: z.string().regex(ARTIFACT_URI_PATTERN),
  sha256,
  dtype: z.literal('float32-le'),
  dim: z.literal(1280),
  count: positiveInt,
});

export const OodSourceInputBase = z.looseObject({ path: nonEmpty, sha256 });

export const OodReferenceBase = z.looseObject({
  schema_version: z.literal(1),
  ood_version: versionString,
  metric: z.literal('cosine_distance'),
  k: z.literal(1),
  threshold: nonNegativeNumber,
  calibration: OodCalibrationBase,
  embeddings: OodEmbeddingsBase,
  row_site_ids: z.array(nonEmpty),
  preprocessing_spec_version: versionString,
  embedding_model: EmbeddingModelBase,
  embedding_space_note: nonEmpty,
  source_inputs: z.array(OodSourceInputBase),
});
export const OodReference = OodReferenceBase;

// ---- inferred types -------------------------------------------------------

export type ContractPointer = z.infer<typeof ContractPointer>;
export type Coverage = z.infer<typeof Coverage>;
export type PresentArtifact = z.infer<typeof PresentArtifact>;
export type AbsentArtifact = z.infer<typeof AbsentArtifact>;
export type ContractManifest = z.infer<typeof ContractManifest>;
export type ContractSite = z.infer<typeof ContractSite>;
export type ContractSitesFile = z.infer<typeof ContractSitesFile>;
export type ModelVersion = z.infer<typeof ModelVersion>;
export type PreprocessingSpec = z.infer<typeof PreprocessingSpec>;
export type Projection = z.infer<typeof Projection>;
export type AnalysisResultStamp = z.infer<typeof AnalysisResultStamp>;
export type EvaluationReport = z.infer<typeof EvaluationReport>;
export type OodReference = z.infer<typeof OodReference>;
