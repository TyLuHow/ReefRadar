// ReefRadar API Types

export type ReefStatus = 'healthy' | 'degraded' | 'restored_early' | 'restored_mid';

export interface Site {
  site_id: string;
  country: string;
  status: ReefStatus;
  latitude?: number;
  longitude?: number;
  location?: string;
}

export interface SitesResponse {
  sites: Site[];
  count: number;
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
};

// Reference site coordinates - all MARRS dataset sites with embeddings
export const SITE_COORDINATES: Record<string, SiteCoordinates> = {
  ind_H4: { lat: -4.929463, lon: 119.316792, location: 'South Sulawesi, Indonesia' },
  ind_H5: { lat: -4.936146, lon: 119.317739, location: 'South Sulawesi, Indonesia' },
  ind_N1: { lat: -4.9310799, lon: 119.3159127, location: 'South Sulawesi, Indonesia' },
  ind_D2: { lat: -4.9401, lon: 119.318815, location: 'South Sulawesi, Indonesia' },
  ind_D3: { lat: -4.930635, lon: 119.316119, location: 'South Sulawesi, Indonesia' },
  ind_R1: { lat: -4.922214, lon: 119.317036, location: 'South Sulawesi, Indonesia' },
  ind_R2: { lat: -4.926557, lon: 119.316267, location: 'South Sulawesi, Indonesia' },
  ken_H1: { lat: -2.215614, lon: 41.013482, location: 'Lamu, Kenya' },
};

// Status marker colors for map (hex colors for Leaflet)
export const STATUS_MARKER_COLORS: Record<ReefStatus, string> = {
  healthy: '#cd853f',
  degraded: '#6b6560',
  restored_early: '#8b7355',
  restored_mid: '#c08081',
};

// Extended Site interface with region
export interface ExtendedSite extends Site {
  region?: string;
  latitude: number;
  longitude: number;
}
