// ReefRadar API Types

export type ReefStatus = 'healthy' | 'degraded' | 'restored_early' | 'restored_mid' | 'unknown';

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
}

export interface SitesResponse {
  sites: Site[];
  count: number;
  total_sites?: number;
  total_all_sites?: number;
  sites_with_embeddings?: number;
  version?: string;
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

export interface RegionInfo {
  detected: string;
  name: string;
  in_training_distribution: boolean;
  confidence_adjusted: boolean;
}

export interface Classification {
  label: ReefStatus;
  confidence: number;
  probabilities: Record<ReefStatus, number>;
  region?: RegionInfo;
}

export interface SimilarSite {
  site_id: string;
  country: string;
  status: ReefStatus;
  similarity: number;
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
  visualization?: Visualization;
  caveats?: string;
  error?: string | { code: string; message: string; suggestion?: string };
}

export interface StatusResponse {
  analysis_id: string;
  stage: string;
  status: 'processing' | 'complete' | 'failed';
  progress?: string;
  error?: { code: string; message: string; suggestion?: string };
  completed_at?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Site coordinates for map display
export interface SiteCoordinates {
  lat: number;
  lon: number;
  location: string;
}

// Status colors mapping
export const STATUS_COLORS: Record<ReefStatus, string> = {
  healthy: '#cd853f',
  degraded: '#6b6560',
  restored_early: '#8b7355',
  restored_mid: '#c08081',
  unknown: '#a8a29e',
};

// Reference site coordinates - 56 sites (45 MARRS + 11 expansion)
export const SITE_COORDINATES: Record<string, SiteCoordinates> = {
  // Indonesia - South Sulawesi (21 sites)
  ind_D1: { lat: -4.928784, lon: 119.316541, location: 'South Sulawesi, Indonesia' },
  ind_D2: { lat: -4.9401, lon: 119.318815, location: 'South Sulawesi, Indonesia' },
  ind_D3: { lat: -4.930635, lon: 119.316119, location: 'South Sulawesi, Indonesia' },
  ind_D4: { lat: -4.931781, lon: 119.316612, location: 'South Sulawesi, Indonesia' },
  ind_D5: { lat: -4.932403, lon: 119.31646, location: 'South Sulawesi, Indonesia' },
  ind_D6: { lat: -4.930792, lon: 119.318102, location: 'South Sulawesi, Indonesia' },
  ind_H1: { lat: -4.9216, lon: 119.316922, location: 'South Sulawesi, Indonesia' },
  ind_H2: { lat: -4.923003, lon: 119.316719, location: 'South Sulawesi, Indonesia' },
  ind_H3: { lat: -4.934867, lon: 119.317384, location: 'South Sulawesi, Indonesia' },
  ind_H4: { lat: -4.929463, lon: 119.316792, location: 'South Sulawesi, Indonesia' },
  ind_H5: { lat: -4.936146, lon: 119.317739, location: 'South Sulawesi, Indonesia' },
  ind_H6: { lat: -4.940581, lon: 119.32009, location: 'South Sulawesi, Indonesia' },
  ind_N1: { lat: -4.9310799, lon: 119.3159127, location: 'South Sulawesi, Indonesia' },
  ind_N2: { lat: -4.9314166, lon: 119.3162828, location: 'South Sulawesi, Indonesia' },
  ind_N3: { lat: -4.9319109, lon: 119.3163365, location: 'South Sulawesi, Indonesia' },
  ind_R1: { lat: -4.922214, lon: 119.317036, location: 'South Sulawesi, Indonesia' },
  ind_R2: { lat: -4.926557, lon: 119.316267, location: 'South Sulawesi, Indonesia' },
  ind_R3: { lat: -4.927522, lon: 119.317245, location: 'South Sulawesi, Indonesia' },
  ind_R4: { lat: -4.927955, lon: 119.315882, location: 'South Sulawesi, Indonesia' },
  ind_R5: { lat: -4.93155, lon: 119.315775, location: 'South Sulawesi, Indonesia' },
  ind_R6: { lat: -4.92572, lon: 119.316127, location: 'South Sulawesi, Indonesia' },
  // Australia - Great Barrier Reef (7 sites)
  aus_D1: { lat: -16.84732, lon: 146.22907, location: 'Great Barrier Reef, Australia' },
  aus_D2: { lat: -16.847, lon: 146.22946, location: 'Great Barrier Reef, Australia' },
  aus_D3: { lat: -16.84667, lon: 146.22975, location: 'Great Barrier Reef, Australia' },
  aus_H1: { lat: -16.84761, lon: 146.22839, location: 'Great Barrier Reef, Australia' },
  aus_H2: { lat: -16.84782, lon: 146.22798, location: 'Great Barrier Reef, Australia' },
  aus_H3: { lat: -16.84656, lon: 146.22653, location: 'Great Barrier Reef, Australia' },
  aus_R1: { lat: -16.84719, lon: 146.22866, location: 'Great Barrier Reef, Australia' },
  // Kenya - Mombasa Coast (5 sites)
  ken_D1: { lat: -2.215419, lon: 41.014101, location: 'Mombasa Coast, Kenya' },
  ken_D3: { lat: -2.213638, lon: 41.019482, location: 'Mombasa Coast, Kenya' },
  ken_H1: { lat: -2.215614, lon: 41.013482, location: 'Mombasa Coast, Kenya' },
  ken_H2: { lat: -2.214743, lon: 41.016132, location: 'Mombasa Coast, Kenya' },
  ken_N1: { lat: -2.21411, lon: 41.017986, location: 'Mombasa Coast, Kenya' },
  // Maldives - North Male Atoll (5 sites)
  mal_D1: { lat: 4.8864713, lon: 72.9360995, location: 'North Male Atoll, Maldives' },
  mal_D2: { lat: 4.8867, lon: 72.9349, location: 'North Male Atoll, Maldives' },
  mal_H1: { lat: 4.8864, lon: 72.9278, location: 'North Male Atoll, Maldives' },
  mal_H2: { lat: 4.8856, lon: 72.9239, location: 'North Male Atoll, Maldives' },
  mal_N1: { lat: 4.8855893, lon: 72.9251649, location: 'North Male Atoll, Maldives' },
  // Mexico - Caribbean Coast (7 sites)
  mex_D1: { lat: 18.3405443, lon: -87.8075489, location: 'Caribbean Coast, Mexico' },
  mex_D2: { lat: 18.288481, lon: -87.825105, location: 'Caribbean Coast, Mexico' },
  mex_H1: { lat: 18.3416616, lon: -87.8074022, location: 'Caribbean Coast, Mexico' },
  mex_H2: { lat: 18.260936, lon: -87.825753, location: 'Caribbean Coast, Mexico' },
  mex_H3: { lat: 18.261723, lon: -87.8255695, location: 'Caribbean Coast, Mexico' },
  mex_N1: { lat: 18.262246, lon: -87.825671, location: 'Caribbean Coast, Mexico' },
  mex_R1: { lat: 18.34107, lon: -87.807348, location: 'Caribbean Coast, Mexico' },
  // French Polynesia - Society Islands (3 sites)
  borabora_undisturbed: { lat: -16.5004, lon: -151.7415, location: 'Bora-Bora, French Polynesia' },
  borabora_tourist: { lat: -16.4864, lon: -151.7256, location: 'Bora-Bora, French Polynesia' },
  borabora_boat_traffic: { lat: -16.5132, lon: -151.7589, location: 'Bora-Bora, French Polynesia' },
  // USA - Florida Keys (8 sites)
  irma_western_dry_rocks: { lat: 24.4468, lon: -81.9275, location: 'Florida Keys, USA' },
  irma_western_dry_rocks_pre: { lat: 24.4468, lon: -81.9275, location: 'Florida Keys, USA' },
  irma_eastern_sambo_pre: { lat: 24.4915, lon: -81.6625, location: 'Florida Keys, USA' },
  irma_eastern_sambo_post: { lat: 24.4915, lon: -81.6625, location: 'Florida Keys, USA' },
  sanctsound_fk01: { lat: 24.5575, lon: -81.4044, location: 'Florida Keys, USA' },
  sanctsound_fk02: { lat: 24.5433, lon: -81.5192, location: 'Florida Keys, USA' },
  sanctsound_fk03: { lat: 24.6128, lon: -81.1067, location: 'Florida Keys, USA' },
  sanctsound_fk04: { lat: 24.4561, lon: -81.7858, location: 'Florida Keys, USA' },
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
