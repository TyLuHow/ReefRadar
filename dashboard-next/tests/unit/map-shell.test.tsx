import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Site } from '@/types';

// jsdom has no WebGL: react-map-gl/maplibre and the setup module (which imports the real
// maplibre-gl) are mocked, so nothing here ever loads the real map engine.
const sourceProps: Record<string, unknown>[] = [];
const layerIds: string[] = [];

vi.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, interactiveLayerIds }: { children?: React.ReactNode; interactiveLayerIds?: string[] }) => (
    <div data-testid="map" data-interactive={(interactiveLayerIds ?? []).join(',')}>
      {children}
    </div>
  ),
  Source: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
    sourceProps.push(props);
    return <div data-testid="source">{children}</div>;
  },
  Layer: ({ id }: { id: string }) => {
    layerIds.push(id);
    return <div data-testid="layer" data-id={id} />;
  },
  AttributionControl: () => <div data-testid="attribution" />,
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
const reportClientError = vi.fn();
vi.mock('@/features/monitoring', () => ({ reportClientError: (...args: unknown[]) => reportClientError(...args) }));
vi.mock('@/features/map/setup', () => ({ mapLib: Promise.resolve({}) }));

import { MapShell, MapErrorBoundary, isFatalMapError, type MapErrorHandler } from '@/features/map/MapShell';
import { ReefMap } from '@/features/map/ReefMap';

type GetContext = typeof HTMLCanvasElement.prototype.getContext;
const realGetContext = HTMLCanvasElement.prototype.getContext;

function stubGetContext(impl: (type: string) => unknown) {
  HTMLCanvasElement.prototype.getContext = impl as unknown as GetContext;
}

beforeEach(() => {
  reportClientError.mockClear();
  sourceProps.length = 0;
  layerIds.length = 0;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.restoreAllMocks();
});

describe('MapShell', () => {
  it('shows the WebGL fallback when no WebGL2 context can be created', () => {
    stubGetContext(() => null);
    render(
      <MapShell height="600px" ariaLabel="Monitoring network map">
        <div>child</div>
      </MapShell>,
    );
    expect(screen.getByText('WebGL is required for the interactive map')).toBeInTheDocument();
    expect(screen.getByText(/does not support WebGL/)).toBeInTheDocument();
    expect(screen.queryByText('child')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('treats a webgl1-only browser as unsupported (MapLibre 6 needs WebGL2)', () => {
    stubGetContext((type) => (type === 'webgl2' ? null : {}));
    render(
      <MapShell height="600px" ariaLabel="Monitoring network map">
        <div>child</div>
      </MapShell>,
    );
    expect(screen.getByText('WebGL is required for the interactive map')).toBeInTheDocument();
  });

  it('renders children inside a labelled region when WebGL2 is available', () => {
    stubGetContext((type) => (type === 'webgl2' ? {} : null));
    render(
      <MapShell height="600px" ariaLabel="Monitoring network map">
        <div>child</div>
      </MapShell>,
    );
    const region = screen.getByRole('region', { name: 'Monitoring network map' });
    expect(region).toContainElement(screen.getByText('child'));
    expect(screen.queryByText('WebGL is required for the interactive map')).not.toBeInTheDocument();
  });

  it('releases the probe context after detection', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));
    stubGetContext((type) => (type === 'webgl2' ? { getExtension } : null));
    render(
      <MapShell height="600px" ariaLabel="x">
        <div>child</div>
      </MapShell>,
    );
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalled();
  });
});

describe('MapShell map error events (WR-02)', () => {
  beforeEach(() => {
    stubGetContext((type) => (type === 'webgl2' ? {} : null));
  });

  function renderWithHandler(styleUrl?: string) {
    let handler: MapErrorHandler | undefined;
    render(
      <MapShell height="600px" ariaLabel="Monitoring network map" styleUrl={styleUrl}>
        {(onMapError) => {
          handler = onMapError;
          return <div>child</div>;
        }}
      </MapShell>,
    );
    return () => handler as MapErrorHandler;
  }

  it('hands the error handler to a function child', () => {
    const get = renderWithHandler();
    expect(typeof get()).toBe('function');
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('swaps in the failure panel and reports when the map fails to initialise (no map instance)', () => {
    const get = renderWithHandler();
    const error = new Error('Invalid mapLib');
    act(() => get()({ error, target: null }));
    expect(screen.getByText('Map failed to initialize')).toBeInTheDocument();
    expect(screen.queryByText('child')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Monitoring network map' })).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(error, { source: 'error-boundary' });
  });

  it('treats a failed style document as fatal but a tile error as non-fatal (reported, map stays)', () => {
    const styleUrl = 'https://basemaps.example.test/style.json';
    const get = renderWithHandler(styleUrl);
    act(() => get()({ error: Object.assign(new Error('Not Found'), { url: 'https://tiles.example.test/1/2/3.png' }), target: {} }));
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(1);
    act(() => get()({ error: Object.assign(new Error('Not Found'), { url: styleUrl }), target: {} }));
    expect(screen.getByText('Map failed to initialize')).toBeInTheDocument();
  });

  it('isFatalMapError: only init failures and the style url', () => {
    expect(isFatalMapError({ target: null })).toBe(true);
    expect(isFatalMapError({ target: {}, error: new Error('x') })).toBe(false);
    expect(isFatalMapError({ target: {}, error: { url: 's' } }, 's')).toBe(true);
    expect(isFatalMapError({ target: {}, error: { url: 's' } })).toBe(false);
  });
});

describe('MapErrorBoundary', () => {
  it('renders "Map failed to initialize" when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): React.ReactElement {
      throw new Error('boom');
    }
    render(
      <MapErrorBoundary height="600px">
        <Boom />
      </MapErrorBoundary>,
    );
    expect(screen.getByText('Map failed to initialize')).toBeInTheDocument();
    expect(screen.getByText(/map could not be displayed/)).toBeInTheDocument();
    // WR-02: a boundary-caught error reaches the monitoring reporter.
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), { source: 'error-boundary' });
    const icon = document.querySelector('svg');
    expect(icon?.getAttribute('stroke')).toBe('#c08081');
  });

  it('renders its children when nothing throws', () => {
    render(
      <MapErrorBoundary height="600px">
        <p>fine</p>
      </MapErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});

describe('ReefMap (mocked engine)', () => {
  const FULL: Site = { site_id: 'idn_1', country: 'Indonesia', status: 'healthy', latitude: -5, longitude: 119 };
  const LOCATION_ONLY: Site = {
    site_id: 'fk_1',
    country: 'USA',
    status: 'restored_mid',
    latitude: 24.5,
    longitude: -81.5,
    has_embedding: false,
  };

  beforeEach(() => {
    stubGetContext((type) => (type === 'webgl2' ? {} : null));
  });

  it('feeds one GeoJSON source (promoteId site_id) and four circle layers', () => {
    render(<ReefMap sites={[FULL, LOCATION_ONLY]} />);
    expect(screen.getByRole('region', { name: 'Monitoring network map' })).toBeInTheDocument();
    expect(sourceProps).toHaveLength(1);
    expect(sourceProps[0]).toMatchObject({ type: 'geojson', promoteId: 'site_id' });
    expect(layerIds).toEqual(['sites-halo', 'sites-core', 'sites-no-embedding-halo', 'sites-no-embedding-core']);
    expect(screen.getByTestId('map').getAttribute('data-interactive')).toBe('sites-core,sites-no-embedding-core');
    expect(screen.getByTestId('attribution')).toBeInTheDocument();
  });

  it('shows the Full data / Location only legend only when location-only sites exist', () => {
    const { unmount } = render(<ReefMap sites={[FULL, LOCATION_ONLY]} />);
    expect(screen.getByText('Full data (1)')).toBeInTheDocument();
    expect(screen.getByText('Location only (1)')).toBeInTheDocument();
    unmount();

    render(<ReefMap sites={[FULL]} />);
    expect(screen.queryByText(/Full data/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Location only/)).not.toBeInTheDocument();
  });

  it('renders with zero sites: no legend, no new copy, still four layers', () => {
    render(<ReefMap sites={[]} />);
    expect(screen.queryByText(/Full data/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No sites/i)).not.toBeInTheDocument();
    expect(layerIds).toHaveLength(4);
  });

  it('lists every site as a keyboard-operable button and selects through it (WR-03)', () => {
    const onSiteSelect = vi.fn();
    render(<ReefMap sites={[FULL, LOCATION_ONLY]} onSiteSelect={onSiteSelect} />);
    const group = screen.getByRole('group', { name: 'Monitoring sites' });
    expect(group).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^(idn_1|fk_1), / });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('type', 'button');
    fireEvent.click(screen.getByRole('button', { name: 'idn_1, Indonesia, Healthy' }));
    expect(onSiteSelect).toHaveBeenCalledWith(FULL);
  });

  it('the popup is a labelled dialog that takes focus, closes on Escape and returns focus to the list button', () => {
    function Harness() {
      const [selected, setSelected] = React.useState<Site | null>(null);
      return <ReefMap sites={[FULL]} selectedSite={selected} onSiteSelect={setSelected} />;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'idn_1, Indonesia, Healthy' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Site details: idn_1' });
    expect(dialog).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close popup' });
    expect(close).toHaveAttribute('type', 'button');
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'idn_1, Indonesia, Healthy' })).toHaveFocus();
  });

  it('shows the SitePopup for the selected site and wires the close button', () => {
    const onSiteSelect = vi.fn();
    render(<ReefMap sites={[FULL]} selectedSite={FULL} onSiteSelect={onSiteSelect} />);
    expect(screen.getByRole('button', { name: 'Close popup' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Close popup' }).click();
    expect(onSiteSelect).toHaveBeenCalledWith(null);
  });
});
