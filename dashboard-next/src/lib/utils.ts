import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format status for display
export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format percentage
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// File size formatter
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Validate WAV file
export function validateWavFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB

  if (!file.name.toLowerCase().endsWith('.wav')) {
    return { valid: false, error: 'Please upload a WAV file' };
  }

  if (file.type && !file.type.includes('audio')) {
    return { valid: false, error: 'File does not appear to be an audio file' };
  }

  if (file.size > MAX_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${formatFileSize(MAX_SIZE)}` };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}

// Get status color class
export function getStatusColorClass(status: string): string {
  const statusLower = status.toLowerCase().replace(/\s/g, '_');
  switch (statusLower) {
    case 'healthy':
      return 'text-status-healthy bg-status-healthy/10';
    case 'degraded':
      return 'text-status-degraded bg-status-degraded/10';
    case 'restored_early':
      return 'text-status-restored-early bg-status-restored-early/10';
    case 'restored_mid':
      return 'text-status-restored-mid bg-status-restored-mid/10';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

// Get status background color
export function getStatusBgColor(status: string): string {
  const statusLower = status.toLowerCase().replace(/\s/g, '_');
  switch (statusLower) {
    case 'healthy':
      return 'bg-status-healthy';
    case 'degraded':
      return 'bg-status-degraded';
    case 'restored_early':
      return 'bg-status-restored-early';
    case 'restored_mid':
      return 'bg-status-restored-mid';
    default:
      return 'bg-gray-400';
  }
}
