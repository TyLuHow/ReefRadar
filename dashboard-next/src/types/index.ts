// ReefRadar API Types

export type ReefStatus = 'healthy' | 'degraded' | 'restored_early' | 'restored_mid' | 'unknown';

// Label provenance (D-17/TRUTH-09): who assigned this site's label, in the
// dataset's own words, and what that label means. Present on API responses
// from apply_label_provenance() (lambdas/shared/site_provenance.py); absent
// on older/fixture shapes that predate it -- every consumer must fall back
// gracefully when these are undefined.
export interface Site {
  site_id: string;
  country: string;
  status: ReefStatus;
  latitude?: number;
  longitude?: number;
  location?: string;
  has_embedding?: boolean;
  region?: string;
  source?: string;
  label_source?: string;
  label_source_name?: string;
  label_assigned_by?: string;
  label_original?: string | null;
  label_definition?: string | null;
  status_basis?: string | null;
  period?: string | null;
  label_note?: string | null;
}

export interface SitesResponse {
  sites: Site[];
  count: number;
  total_sites?: number;
  total_all_sites?: number;
  sites_with_embeddings?: number;
  version?: string;
}

// recovered from the deployed bundle (module 63181) on 2026-10-01 per D-02 — field set
// derived from SampleCard.tsx's existing usage and the live GET /samples response shape.
export interface Sample {
  id: string;
  site_id: string;
  name: string;
  country: string;
  country_code: string;
  category: ReefStatus;
  description: string;
  duration_seconds: number;
  audio_url: string;
  frequency_highlights: string[];
  coordinates: { lat: number; lng: number };
}

export interface SampleStory {
  title: string;
  subtitle: string;
  sample_ids: string[];
}

export interface SamplesResponse {
  samples: Sample[];
  stories: Record<string, SampleStory>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface UploadResponse {
  upload_id: string;
  filename: string;
  size: number;
  status: string;
}

export interface AnalyzeResponse {
  analysis_id: string;
  upload_id: string;
  status: string;
}

// D-12 (TRUTH-06): region status is a separate, honest fact about where the
// recording is and what the classifier was actually trained on -- it never
// implies a probability was scaled. The new fields come from the 01-11
// classifier contract; the two `_distribution`/`_adjusted` fields are kept
// optional so an older API response (pre-01-11/14 deploy) still renders.
export interface RegionInfo {
  detected: string;
  name: string;
  scope?: 'specific' | 'broad' | null;
  coordinates_provided?: boolean;
  in_training_region?: boolean;
  /** Training sites within `training_radius_km` of the recording. */
  training_sites_in_region?: number;
  /** Distance to the nearest real training site (null/absent when unknown). */
  nearest_training_site_km?: number | null;
  training_radius_km?: number;
  training_countries?: string[];
  // legacy fields, kept for backward compatibility with older API responses
  in_training_distribution?: boolean;
  confidence_adjusted?: boolean;
}

export interface Classification {
  label: ReefStatus;
  confidence: number;
  // Partial: the deployed model may not have every ReefStatus class (an
  // interim 3-class model has no restored_mid key at all) -- see
  // src/lib/probabilities.ts.
  probabilities: Partial<Record<ReefStatus, number>>;
  model_version?: string;
  region?: RegionInfo;
}

export interface SimilarSite {
  site_id: string;
  country: string;
  status: ReefStatus;
  similarity: number;
  // Dataset label provenance (D-17/TRUTH-09) -- present when the backend
  // overlays apply_label_provenance(); absent on older API responses.
  label_source?: string;
  label_source_name?: string;
  label_original?: string;
}

export interface VisualizationCoordinates {
  x: number;
  y: number;
  z?: number;
}

export interface ReferenceSiteVisualization {
  site_id: string;
  status: ReefStatus;
  x: number;
  y: number;
  z?: number;
}

export interface Visualization {
  coordinates: VisualizationCoordinates;
  reference_sites: ReferenceSiteVisualization[];
}

export interface AnalysisResult {
  analysis_id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  classification?: Classification;
  similar_sites?: SimilarSite[];
  /** Present (non-empty) when the similar-site lookup failed or had nothing comparable. */
  similar_sites_error?: string | null;
  visualization?: Visualization;
  caveats?: string;
  // stage/request_id/retry_count: handle_visualize (lambdas/router/handler.py)
  // includes these on a failed analysis's error object -- pollAnalysis (D-15)
  // reads request_id from here since /status's error does not carry it.
  error?: {
    code: string;
    message: string;
    suggestion?: string;
    stage?: string;
    request_id?: string;
    retry_count?: number;
  } | string;
}

export interface StatusResponse {
  analysis_id: string;
  stage: string;
  status: 'processing' | 'complete' | 'failed';
  progress?: string;
  error?: { code: string; message: string; suggestion?: string };
  completed_at?: string;
}

// D-15: the real pipeline stage reported by GET /status/{id}, mapped to a
// human-readable label pollAnalysis's onStage callback hands to the UI.
export interface StageInfo {
  stage: string;
  label: string;
  progress?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Status colors mapping
export const STATUS_COLORS: Record<ReefStatus, string> = {
  healthy: '#cd853f',
  degraded: '#6b6560',
  restored_early: '#8b7355',
  restored_mid: '#c08081',
  unknown: '#a8a29e',
};

// Status marker colors for map (hex colors for Leaflet)
export const STATUS_MARKER_COLORS: Record<ReefStatus, string> = {
  healthy: '#cd853f',
  degraded: '#6b6560',
  restored_early: '#8b7355',
  restored_mid: '#c08081',
  unknown: '#a8a29e',
};

// Extended Site interface with region
export interface ExtendedSite extends Site {
  region?: string;
  latitude: number;
  longitude: number;
}
