import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useSiteIndex } from '@/features/contract';
import type { SimilarSite } from '@/types';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

// jsdom has no WebGL: react-map-gl/maplibre and the setup module (which imports the real
// maplibre-gl) are mocked, so nothing here ever loads the real map engine.
const mapProps: Record<string, unknown>[] = [];
const fitBounds = vi.fn();
const disableRotation = vi.fn();
const navigationControls: number[] = [];
const attributionProps: Record<string, unknown>[] = [];

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react');
  return {
    Map: React.forwardRef(function MockMap(
      props: { children?: ReactNode; onLoad?: () => void } & Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      const { children, onLoad, ...rest } = props;
      mapProps.push(rest);
      React.useImperativeHandle(ref, () => ({
        fitBounds,
        getMap: () => ({ touchZoomRotate: { disableRotation } }),
      }));
      React.useEffect(() => {
        onLoad?.();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="maplibre-map">{children}</div>;
    }),
    NavigationControl: () => {
      navigationControls.push(1);
      return null;
    },
    AttributionControl: (props: Record<string, unknown>) => {
      attributionProps.push(props);
      return <div data-testid="attribution" />;
    },
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/features/map/setup', () => ({ mapLib: Promise.resolve({}) }));
vi.mock('@/features/map/SiteMarker', () => ({
  SiteMarker: ({
    site,
    isHighlighted,
  }: {
    site: { site_id: string; location?: string; latitude?: number; longitude?: number };
    isHighlighted?: boolean;
  }) => (
    <div
      data-testid="marker"
      data-site={site.site_id}
      data-location={site.location}
      data-lat={site.latitude}
      data-lon={site.longitude}
      data-highlight={String(Boolean(isHighlighted))}
    />
  ),
}));

import { MiniMap } from '@/features/map/MiniMap';
import { MINI_MAP_STYLE } from '@/features/map/style';

const realGetContext = HTMLCanvasElement.prototype.getContext;

function stubWebGL2(available: boolean) {
  HTMLCanvasElement.prototype.getContext = (() =>
    available ? { getExtension: () => null } : null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

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
    mapProps.length = 0;
    navigationControls.length = 0;
    attributionProps.length = 0;
    fitBounds.mockClear();
    disableRotation.mockClear();
    stubWebGL2(true);
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext;
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

  it('places the markers at the contract coordinates ([lon, lat] order) and highlights the top sites', async () => {
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR, highlightCount: 1 })));
    const markers = await screen.findAllByTestId('marker');
    expect(markers[0].getAttribute('data-lon')).toBe('119.316922');
    expect(markers[1].getAttribute('data-lon')).toBe('-81.6625');
    expect(markers.map((m) => m.getAttribute('data-highlight'))).toEqual(['true', 'false']);
    // Rank badge for the top site is unchanged.
    expect(screen.getByText('ind_H1')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('configures the map: 200px, zoom 5, scroll zoom off, drag pan and touch zoom on, no rotation, no zoom control', async () => {
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR })));
    await screen.findAllByTestId('marker');

    const props = mapProps[mapProps.length - 1];
    expect(props.scrollZoom).toBe(false);
    expect(props.dragPan).toBe(true);
    expect(props.touchZoomRotate).toBe(true);
    expect(props.dragRotate).toBe(false);
    expect(props.attributionControl).toBe(false);
    expect(props.mapStyle).toBe(MINI_MAP_STYLE);
    expect((props.initialViewState as { zoom: number }).zoom).toBe(5);
    expect(navigationControls).toHaveLength(0);
    expect(attributionProps[0]).toMatchObject({ compact: false });
    expect(screen.getByRole('region', { name: /similar reference sites/i })).toBeInTheDocument();
  });

  it('fits the bounds in an effect (padding 30, maxZoom 8), never during render, and turns touch rotation off', async () => {
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR })));
    await screen.findAllByTestId('marker');
    await waitFor(() => expect(fitBounds).toHaveBeenCalled());
    const [bounds, options] = fitBounds.mock.calls[fitBounds.mock.calls.length - 1];
    expect(options).toMatchObject({ padding: 30, maxZoom: 8 });
    // [[west, south], [east, north]] from the two contract sites
    expect(bounds).toEqual([
      [-81.6625, -4.9216],
      [119.316922, 24.4915],
    ]);
    expect(disableRotation).toHaveBeenCalled();
  });

  it('shows "No location data available" when no similar site resolves in the index', async () => {
    const unknown = [{ site_id: 'not_a_site', similarity: 0.5, status: 'healthy', country: 'Nowhere' }] as SimilarSite[];
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: unknown })));
    expect(await screen.findByText('No location data available')).toBeInTheDocument();
    expect(screen.queryByTestId('maplibre-map')).not.toBeInTheDocument();
  });

  it('shows the 200px fallback with the single line when WebGL2 is unavailable', async () => {
    stubWebGL2(false);
    render(createElement(QueryClientProvider, { client }, createElement(MiniMap, { similarSites: SIMILAR })));
    expect(await screen.findByText('WebGL is required for the interactive map')).toBeInTheDocument();
    expect(screen.queryByText(/does not support WebGL/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('maplibre-map')).not.toBeInTheDocument();
  });
});
