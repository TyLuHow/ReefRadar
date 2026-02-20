// ReefRadar API Client

import {
  HealthResponse,
  SitesResponse,
  UploadResponse,
  AnalyzeResponse,
  AnalysisResult,
  StatusResponse,
  ApiError,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as ApiError;
        throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  // Health check
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Get reference sites
  async getSites(): Promise<SitesResponse> {
    return this.request<SitesResponse>('/sites');
  }

  // Upload audio file
  async uploadAudio(file: File): Promise<UploadResponse> {
    const arrayBuffer = await file.arrayBuffer();

    return this.request<UploadResponse>('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        'X-Filename': file.name,
      },
      body: arrayBuffer,
    });
  }

  // Start analysis (with optional coordinates for region detection)
  async startAnalysis(
    uploadId: string,
    latitude?: number,
    longitude?: number
  ): Promise<AnalyzeResponse> {
    const payload: Record<string, unknown> = { upload_id: uploadId };
    if (latitude !== undefined) payload.latitude = latitude;
    if (longitude !== undefined) payload.longitude = longitude;

    return this.request<AnalyzeResponse>('/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  // Get processing status
  async getStatus(analysisId: string): Promise<StatusResponse> {
    return this.request<StatusResponse>(`/status/${analysisId}`);
  }

  // Get analysis results (poll this endpoint)
  async getAnalysisResult(analysisId: string): Promise<AnalysisResult> {
    return this.request<AnalysisResult>(`/visualize/${analysisId}`);
  }

  // Poll for analysis completion
  async pollAnalysis(
    analysisId: string,
    onProgress?: (status: string) => void,
    maxAttempts: number = 60,
    interval: number = 2000
  ): Promise<AnalysisResult> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const result = await this.getAnalysisResult(analysisId);

      if (onProgress) {
        onProgress(result.status);
      }

      if (result.status === 'complete') {
        return result;
      }

      if (result.status === 'failed') {
        const errMsg = typeof result.error === 'string'
          ? result.error
          : result.error?.message || 'Analysis failed';
        throw new Error(errMsg);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }

    throw new Error('Analysis timed out');
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or custom instances
export { ApiClient };
