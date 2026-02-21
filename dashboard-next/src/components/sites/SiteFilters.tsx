'use client';

import { useState, useMemo } from 'react';
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
  useMemo(() => {
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
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-t-xl transition-colors"
      >
        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-reef-primary" />
          <span className="font-semibold text-gray-900">Filters</span>
          {hasActiveFilters && (
            <span className="bg-reef-primary text-white text-xs px-2 py-0.5 rounded-full">
              {selectedStatuses.size + selectedCountries.size + (searchQuery ? 1 : 0)}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-gray-400 transition-transform',
            isExpanded ? 'rotate-180' : ''
          )}
        />
      </button>

      {/* Filter Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          {/* Search */}
          <div className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-reef-primary focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
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
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                    style={isSelected ? { backgroundColor: color } : undefined}
                  >
                    {formatStatus(status)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Country Filter */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
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
                        ? 'bg-reef-primary text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    <span>{country}</span>
                    <span
                      className={cn(
                        'text-xs',
                        isSelected ? 'text-white/80' : 'text-gray-400'
                      )}
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
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={clearFilters}
                className="text-sm text-reef-primary hover:text-reef-secondary font-medium flex items-center space-x-1"
              >
                <X className="w-4 h-4" />
                <span>Clear all filters</span>
              </button>
            </div>
          )}

          {/* Results Count */}
          <div className="text-sm text-gray-500">
            Showing {filteredSites.length} of {sites.length} sites
          </div>
        </div>
      )}
    </div>
  );
}
