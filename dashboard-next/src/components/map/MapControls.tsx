'use client';

import { RotateCcw } from 'lucide-react';
import { ReefStatus } from '@/types';

const COUNTRIES = ['Indonesia', 'Australia', 'Kenya', 'Maldives', 'Mexico'];
const STATUSES: { value: ReefStatus; label: string; color: string }[] = [
  { value: 'healthy', label: 'Healthy', color: '#cd853f' },
  { value: 'degraded', label: 'Degraded', color: '#6b6560' },
  { value: 'restored_early', label: 'Restored (Early)', color: '#8b7355' },
  { value: 'restored_mid', label: 'Restored (Mid)', color: '#c08081' },
];

interface MapControlsProps {
  selectedCountries: string[];
  selectedStatuses: ReefStatus[];
  onCountryToggle: (country: string) => void;
  onStatusToggle: (status: ReefStatus) => void;
  onReset: () => void;
  className?: string;
}

export function MapControls({
  selectedCountries,
  selectedStatuses,
  onCountryToggle,
  onStatusToggle,
  onReset,
  className,
}: MapControlsProps) {
  const hasFilters =
    selectedCountries.length < COUNTRIES.length ||
    selectedStatuses.length < STATUSES.length;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 10,
        background: 'rgba(26, 23, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(229, 225, 219, 0.1)',
        borderRadius: '10px',
        padding: '14px 16px',
        width: '200px',
      }}
    >
      {/* Country filters */}
      <p
        className="text-xs font-semibold mb-2 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Country
      </p>
      <div className="space-y-1 mb-3">
        {COUNTRIES.map((country) => {
          const checked = selectedCountries.includes(country);
          return (
            <label
              key={country}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onCountryToggle(country)}
                className="sr-only"
              />
              <span
                className="w-3.5 h-3.5 rounded border flex items-center justify-center text-xs transition-colors"
                style={{
                  borderColor: checked
                    ? '#cd853f'
                    : 'rgba(229, 225, 219, 0.2)',
                  backgroundColor: checked
                    ? 'rgba(205, 133, 63, 0.2)'
                    : 'transparent',
                  color: checked ? '#cd853f' : 'transparent',
                }}
              >
                {checked && '\u2713'}
              </span>
              <span
                className="text-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                {country}
              </span>
            </label>
          );
        })}
      </div>

      {/* Status filters */}
      <p
        className="text-xs font-semibold mb-2 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Status
      </p>
      <div className="space-y-1 mb-3">
        {STATUSES.map((s) => {
          const checked = selectedStatuses.includes(s.value);
          return (
            <label
              key={s.value}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onStatusToggle(s.value)}
                className="sr-only"
              />
              <span
                className="w-3.5 h-3.5 rounded border flex items-center justify-center text-xs transition-colors"
                style={{
                  borderColor: checked ? s.color : 'rgba(255,255,255,0.2)',
                  backgroundColor: checked
                    ? `${s.color}33`
                    : 'transparent',
                  color: checked ? s.color : 'transparent',
                }}
              >
                {checked && '\u2713'}
              </span>
              <span
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs w-full px-2 py-1.5 rounded-md transition-colors hover:bg-white/5"
          style={{ color: '#cd853f' }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset Filters
        </button>
      )}
    </div>
  );
}
