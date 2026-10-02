import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useSiteIndex } from '@/features/contract';
import type { SimilarSite } from '@/types';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

// The Leaflet runtime is not jsdom friendly and is irrelevant to what is asserted here.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ fitBounds: () => undefined }),
}));
vi.mock('leaflet', () => ({ default: { latLngBounds: (points: unknown) => points } }));
vi.mock('@/components/maps/SiteMarker', () => ({
  SiteMarker: ({ site }: { site: { site_id: string; location?: string; latitude?: number } }) => (
    <div data-testid="marker" data-site={site.site_id} data-location={site.location} data-lat={site.latitude} />
  ),
}));

import { MiniMap } from '@/components/maps/MiniMap';

/**
 * 02-09: the site index (id -> coordinates and location) that the analysis
 * mini map uses is built from the contract, never from a hard-coded table.
 */

let handle: ContractFetchHandle;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

const SIMILAR: SimilarSite[] = [
  { site_id: 'ind_H1', similarity: 0.91, status: 'healthy', country: 'Indonesia' },
  { site_id: 'irma_eastern_sambo', similarity: 0.82, status: 'degraded', country: 'USA' },
] as SimilarSite[];

describe('useSiteIndex and MiniMap on the contract', () => {
  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  it('indexes all 54 contract sites by id with lat, lon and location', async () => {
    const { result } = renderHook(() => useSiteIndex(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.data).toBeDefined());
    const index = result.current.data!;
    expect(Object.keys(index)).toHaveLength(54);
    expect(index.ind_H1).toEqual({ lat: -4.9216, lon: 119.316922, location: 'South Sulawesi, Indonesia' });
    expect(index.irma_eastern_sambo).toEqual({ lat: 24.4915, lon: -81.6625, location: 'Florida Keys, USA' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(handle.refused).toEqual([]);
  });

  it('places similar sites from the index, with their location, once it has loaded', async () => {
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR })));
    const markers = await screen.findAllByTestId('marker');
    expect(markers.map((m) => m.getAttribute('data-site'))).toEqual(['ind_H1', 'irma_eastern_sambo']);
    expect(markers[1].getAttribute('data-location')).toBe('Florida Keys, USA');
    expect(markers[0].getAttribute('data-lat')).toBe('-4.9216');
  });

  it('shows the loading panel, not the "no location data" state, while the index loads', async () => {
    const inner = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await gate;
      return inner(input, init);
    }) as unknown as typeof fetch;

    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR })));
    expect(screen.getByText('Loading map...')).toBeInTheDocument();
    expect(screen.queryByText(/No location data available/i)).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(2));
    expect(screen.queryByText('Loading map...')).not.toBeInTheDocument();
  });
});
