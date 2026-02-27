'use client';

import { useState } from 'react';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { ReefStatus } from '@/types';
import { REGIONS, type RegionBounds } from '@/lib/regions';

const COUNTRIES = ['Indonesia', 'Australia', 'Kenya', 'Maldives', 'Mexico', 'USA', 'French Polynesia'];
const STATUSES: { value: ReefStatus; label: string; color: string }[] = [
  { value: 'healthy', label: 'Healthy', color: '#cd853f' },
  { value: 'degraded', label: 'Degraded', color: '#6b6560' },
  { value: 'restored_early', label: 'Restored (Early)', color: '#8b7355' },
  { value: 'restored_mid', label: 'Restored (Mid)', color: '#c08081' },
  { value: 'unknown', label: 'Unknown', color: '#a8a29e' },
];

interface MapControlsProps {
  selectedCountries: string[];
  selectedStatuses: ReefStatus[];
  onCountryToggle: (country: string) => void;
  onStatusToggle: (status: ReefStatus) => void;
  onReset: () => void;
  onRegionSelect?: (region: RegionBounds) => void;
  selectedRegionId?: string;
  className?: string;
}

export function MapControls({
  selectedCountries,
  selectedStatuses,
  onCountryToggle,
  onStatusToggle,
  onReset,
  onRegionSelect,
  selectedRegionId,
  className,
}: MapControlsProps) {
  const [collapsed, setCollapsed] = useState(false);

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
        padding: collapsed ? '10px 16px' : '14px 16px',
        width: '200px',
      }}
    >
      {/* Collapse toggle for mobile */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full md:hidden"
        style={{ color: '#e5e1db' }}
        aria-label={collapsed ? 'Expand controls' : 'Collapse controls'}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Map Controls
        </span>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>

      {/* Collapsible body */}
      <div style={{ display: collapsed ? 'none' : 'block' }}>
        {/* Region selector -- Jump to Region */}
        {onRegionSelect && (
          <div className="mb-3">
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wider hidden md:block"
              style={{ color: 'var(--text-muted)' }}
            >
              Jump to Region
            </p>
            <p
              className="text-xs font-semibold mb-2 mt-2 uppercase tracking-wider md:hidden"
              style={{ color: 'var(--text-muted)' }}
            >
              Jump to Region
            </p>
            <select
              value={selectedRegionId || 'global'}
              onChange={(e) => {
                const region = REGIONS.find((r) => r.id === e.target.value);
                if (region) onRegionSelect(region);
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                color: '#e5e1db',
                background: 'rgba(26, 23, 20, 0.5)',
                border: '1px solid rgba(229, 225, 219, 0.15)',
                borderRadius: '6px',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                paddingRight: '28px',
              }}
            >
              {REGIONS.map((region) => (
                <option
                  key={region.id}
                  value={region.id}
                  style={{
                    background: '#1a1714',
                    color: '#e5e1db',
                  }}
                >
                  {region.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Divider between region and filters */}
        {onRegionSelect && (
          <div
            style={{
              height: '1px',
              background: 'rgba(229, 225, 219, 0.08)',
              marginBottom: '12px',
            }}
          />
        )}

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
    </div>
  );
}
