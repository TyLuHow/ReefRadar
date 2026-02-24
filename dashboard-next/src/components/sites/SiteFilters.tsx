'use client';

import { useState, useMemo, useEffect } from 'react';
import { Site, ReefStatus, STATUS_COLORS } from '@/types';
import { formatStatus, cn } from '@/lib/utils';
import { Filter, X, ChevronDown, Search } from 'lucide-react';

interface SiteFiltersProps {
  sites: Site[];
  onFilteredSitesChange: (filteredSites: Site[]) => void;
  className?: string;
}

export function SiteFilters({ sites, onFilteredSitesChange, className = '' }: SiteFiltersProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ReefStatus>>(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  // Default to expanded, collapses on mobile after mount
  const [isExpanded, setIsExpanded] = useState(true);

  // Get unique statuses and countries
  const uniqueStatuses = useMemo(() => {
    return Array.from(new Set(sites.map((s) => s.status)));
  }, [sites]);

  const uniqueCountries = useMemo(() => {
    return Array.from(new Set(sites.map((s) => s.country))).sort();
  }, [sites]);

  // Filter sites based on selection
  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      // Status filter
      if (selectedStatuses.size > 0 && !selectedStatuses.has(site.status)) {
        return false;
      }

      // Country filter
      if (selectedCountries.size > 0 && !selectedCountries.has(site.country)) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          site.site_id.toLowerCase().includes(query) ||
          site.country.toLowerCase().includes(query) ||
          site.status.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [sites, selectedStatuses, selectedCountries, searchQuery]);

  // Update parent whenever filters change
  useEffect(() => {
    onFilteredSitesChange(filteredSites);
  }, [filteredSites, onFilteredSitesChange]);

  const toggleStatus = (status: ReefStatus) => {
    const newSet = new Set(selectedStatuses);
    if (newSet.has(status)) {
      newSet.delete(status);
    } else {
      newSet.add(status);
    }
    setSelectedStatuses(newSet);
  };

  const toggleCountry = (country: string) => {
    const newSet = new Set(selectedCountries);
    if (newSet.has(country)) {
      newSet.delete(country);
    } else {
      newSet.add(country);
    }
    setSelectedCountries(newSet);
  };

  const clearFilters = () => {
    setSelectedStatuses(new Set());
    setSelectedCountries(new Set());
    setSearchQuery('');
  };

  const hasActiveFilters = selectedStatuses.size > 0 || selectedCountries.size > 0 || searchQuery;

  return (
    <div className={cn('glass-panel', className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left rounded-t-xl transition-colors hover:bg-white/5"
      >
        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-ochre" />
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Filters</span>
          {hasActiveFilters && (
            <span className="bg-ochre text-white text-xs px-2 py-0.5 rounded-full">
              {selectedStatuses.size + selectedCountries.size + (searchQuery ? 1 : 0)}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 transition-transform',
            isExpanded ? 'rotate-180' : ''
          )}
          style={{ color: 'var(--text-dim)' }}
        />
      </button>

      {/* Filter Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {/* Search */}
          <div className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-ochre"
                style={{
                  background: 'var(--bg-depths)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
              Health Status
            </label>
            <div className="flex flex-wrap gap-2">
              {uniqueStatuses.map((status) => {
                const isSelected = selectedStatuses.has(status);
                const color = STATUS_COLORS[status];
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                      isSelected
                        ? 'text-white shadow-sm'
                        : 'hover:bg-white/10'
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: color }
                        : { background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }
                    }
                  >
                    {formatStatus(status)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Country Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
              Country
            </label>
            <div className="flex flex-wrap gap-2">
              {uniqueCountries.map((country) => {
                const isSelected = selectedCountries.has(country);
                const count = sites.filter((s) => s.country === country).length;
                return (
                  <button
                    key={country}
                    onClick={() => toggleCountry(country)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center space-x-1',
                      isSelected
                        ? 'bg-ochre text-white shadow-sm'
                        : 'hover:bg-white/10'
                    )}
                    style={
                      !isSelected
                        ? { background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }
                        : undefined
                    }
                  >
                    <span>{country}</span>
                    <span
                      className={cn(
                        'text-xs',
                        isSelected ? 'text-white/80' : ''
                      )}
                      style={!isSelected ? { color: 'var(--text-dim)' } : undefined}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <button
                onClick={clearFilters}
                className="text-sm text-ochre hover:text-pale-gold font-medium flex items-center space-x-1"
              >
                <X className="w-4 h-4" />
                <span>Clear all filters</span>
              </button>
            </div>
          )}

          {/* Results Count */}
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Showing {filteredSites.length} of {sites.length} sites
          </div>
        </div>
      )}
    </div>
  );
}
