'use client';

import { useState } from 'react';
import { GlassPanel, GlassButton, GlassInput } from '@/components/ui/glass';

interface CoordinateModalProps {
  file: File;
  onSubmit: (file: File, latitude?: number, longitude?: number) => void;
  onCancel: () => void;
}

export function CoordinateModal({ file, onSubmit, onCancel }: CoordinateModalProps) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latError, setLatError] = useState('');
  const [lonError, setLonError] = useState('');

  function validateCoords(): { lat?: number; lon?: number } | null {
    let hasError = false;
    let lat: number | undefined;
    let lon: number | undefined;

    if (latitude.trim()) {
      const parsed = parseFloat(latitude);
      if (isNaN(parsed) || parsed < -90 || parsed > 90) {
        setLatError('Must be between -90 and 90');
        hasError = true;
      } else {
        setLatError('');
        lat = parsed;
      }
    } else {
      setLatError('');
    }

    if (longitude.trim()) {
      const parsed = parseFloat(longitude);
      if (isNaN(parsed) || parsed < -180 || parsed > 180) {
        setLonError('Must be between -180 and 180');
        hasError = true;
      } else {
        setLonError('');
        lon = parsed;
      }
    } else {
      setLonError('');
    }

    if (hasError) return null;
    return { lat, lon };
  }

  function handleAnalyze() {
    const coords = validateCoords();
    if (coords === null) return;
    onSubmit(file, coords.lat, coords.lon);
  }

  function handleSkip() {
    onSubmit(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 backdrop-blur-sm px-4">
      <GlassPanel className="p-8 max-w-md w-full space-y-6">
        <div>
          <h2 className="text-lg font-light text-bone">
            Add Recording Location
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Optional -- improves region detection accuracy
          </p>
        </div>

        <div className="space-y-4">
          <GlassInput
            label="Latitude"
            placeholder="-4.93 (e.g. South Sulawesi)"
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            error={latError}
          />
          <GlassInput
            label="Longitude"
            placeholder="119.32 (e.g. South Sulawesi)"
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            error={lonError}
          />
        </div>

        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          File: {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </div>

        <div className="flex gap-3">
          <GlassButton variant="ghost" onClick={handleSkip} className="flex-1">
            Skip
          </GlassButton>
          <GlassButton onClick={handleAnalyze} className="flex-1">
            Analyze Recording
          </GlassButton>
        </div>

        <button
          onClick={onCancel}
          className="w-full text-center text-xs hover:text-bone"
          style={{ color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
      </GlassPanel>
    </div>
  );
}
