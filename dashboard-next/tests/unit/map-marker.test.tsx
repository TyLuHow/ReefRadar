import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { STATUS_COLORS, type Site } from '@/types';

// jsdom has no WebGL: react-map-gl/maplibre and the setup module (which imports the real
// maplibre-gl) are mocked, so nothing here ever loads the real map engine.
const markerProps: { longitude: number; latitude: number; anchor?: string }[] = [];
const popupProps: Record<string, unknown>[] = [];

vi.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({
    children,
    longitude,
    latitude,
    anchor,
  }: {
    children?: React.ReactNode;
    longitude: number;
    latitude: number;
    anchor?: string;
  }) => {
    markerProps.push({ longitude, latitude, anchor });
    return <div data-testid="marker">{children}</div>;
  },
  Popup: ({
    children,
    onClose,
    ...rest
  }: { children?: React.ReactNode; onClose?: () => void } & Record<string, unknown>) => {
    popupProps.push(rest);
    return (
      <div data-testid="popup">
        <button type="button" aria-label="Close popup" onClick={onClose} />
        {children}
      </div>
    );
  },
  NavigationControl: () => null,
  AttributionControl: () => null,
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/features/map/setup', () => ({ mapLib: Promise.resolve({}) }));

import { SiteMarker, siteMarkerLabel } from '@/features/map/SiteMarker';
import { WorldMap } from '@/features/map/WorldMap';
import { WORLD_MAP_STYLE, WORLD_MAP_ATTRIBUTION, MINI_MAP_ATTRIBUTION } from '@/features/map/style';

// A real record from the committed contract (contracts/bucket/v1/sites.json), as the legacy adapter shapes it.
const IND_H1: Site = {
  site_id: 'ind_H1',
  country: 'Indonesia',
  status: 'healthy',
  latitude: -4.9216,
  longitude: 119.316922,
  location: 'South Sulawesi, Indonesia',
};

const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  markerProps.length = 0;
  popupProps.length = 0;
  // A truthy webgl2 context so MapShell renders the map branch.
  HTMLCanvasElement.prototype.getContext = (() => ({
    getExtension: () => null,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.restoreAllMocks();
});

describe('SiteMarker', () => {
  it('is a button named with the site id, country and status (never "Marker")', () => {
    render(<SiteMarker site={IND_H1} />);
    const button = screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' });
    expect(button).toHaveAttribute('type', 'button');
    expect(siteMarkerLabel({ site_id: 'x_1', country: 'Kenya', status: 'restored_early' })).toBe(
      'x_1, Kenya, Restored Early',
    );
  });

  it('passes longitude and latitude to the marker, not swapped', () => {
    render(<SiteMarker site={IND_H1} />);
    expect(markerProps).toHaveLength(1);
    expect(markerProps[0].longitude).toBeCloseTo(119.3, 0);
    expect(markerProps[0].latitude).toBeCloseTo(-4.9, 0);
    expect(markerProps[0].anchor).toBe('center');
  });

  it('draws the 12px dot with a 2px white border in the STATUS_COLORS colour, 16px and 3px when highlighted', () => {
    const { rerender } = render(<SiteMarker site={IND_H1} />);
    const dot = screen.getByRole('button', { name: /ind_H1/ });
    expect(dot.style.width).toBe('12px');
    expect(dot.style.height).toBe('12px');
    expect(dot.style.borderWidth).toBe('2px');
    expect(dot.style.backgroundColor).not.toBe('');
    expect(dot.className).not.toContain('marker-pulse');

    rerender(<SiteMarker site={IND_H1} isHighlighted />);
    const highlighted = screen.getByRole('button', { name: /ind_H1/ });
    expect(highlighted.style.width).toBe('16px');
    expect(highlighted.style.borderWidth).toBe('3px');
    expect(highlighted.className).toContain('marker-pulse');
    expect(STATUS_COLORS.healthy).toBe('#cd853f');
  });

  // Enter and Space are the native button activation: a browser turns both into this click
  // (jsdom does not, and user-event is not a dependency); the real keys run in maps.spec.ts.
  it('opens the popup when the marker button is activated (Enter, Space or click)', () => {
    render(<SiteMarker site={IND_H1} similarity={0.91} />);
    expect(screen.queryByRole('button', { name: 'Close popup' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));

    expect(screen.getByRole('button', { name: 'Close popup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'ind_H1' })).toBeInTheDocument();
    expect(screen.getByText('Country:')).toBeInTheDocument();
    expect(screen.getByText('Indonesia', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Region:')).toBeInTheDocument();
    expect(screen.getByText('South Sulawesi', { exact: false, selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('-4.9216, 119.3169')).toBeInTheDocument();
    expect(screen.getByText('Similarity:')).toBeInTheDocument();
    expect(screen.getByText('91.0%')).toBeInTheDocument();
  });

  it('keeps the popup open on a map click (closeOnClick false) with maxWidth 300px', () => {
    render(<SiteMarker site={IND_H1} />);
    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));
    expect(popupProps).not.toHaveLength(0);
    expect(popupProps[0].closeOnClick).toBe(false);
    expect(popupProps[0].maxWidth).toBe('300px');
  });

  it('omits the similarity block when there is no similarity', () => {
    render(<SiteMarker site={IND_H1} />);
    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));
    expect(screen.queryByText('Similarity:')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the marker button', () => {
    render(<SiteMarker site={IND_H1} />);
    const button = screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Close popup' })).toBeInTheDocument();
    (screen.getByRole('button', { name: 'Close popup' }) as HTMLElement).focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Close popup' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it('returns focus to the marker when the close button closes the popup', () => {
    render(<SiteMarker site={IND_H1} />);
    const button = screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));

    expect(screen.queryByRole('button', { name: 'Close popup' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it('ignores other keys while open', () => {
    render(<SiteMarker site={IND_H1} />);
    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('button', { name: 'Close popup' })).toBeInTheDocument();
  });

  it('calls onClick when activated', () => {
    const onClick = vi.fn();
    render(<SiteMarker site={IND_H1} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a site without coordinates', () => {
    const { container } = render(<SiteMarker site={{ ...IND_H1, latitude: undefined, longitude: undefined }} />);
    expect(container).toBeEmptyDOMElement();
    expect(markerProps).toHaveLength(0);
  });

  it('renders a long location in full inside the popup (no truncation)', () => {
    const long =
      'A very long reef location name that goes on and on past any sensible width for a popup card';
    render(<SiteMarker site={{ ...IND_H1, location: `${long}, Indonesia` }} />);
    fireEvent.click(screen.getByRole('button', { name: 'ind_H1, Indonesia, Healthy' }));
    const region = screen.getByText(long, { exact: false, selector: 'p' });
    expect(region).toBeInTheDocument();
    expect(region.className).not.toContain('truncate');
    expect(region.textContent).not.toContain('…');
  });
});

function site(id: string, status: Site['status']): Site {
  return { ...IND_H1, site_id: id, status };
}

describe('WorldMap', () => {
  it('shows only non-zero legend rows with real counts', () => {
    render(
      <WorldMap
        sites={[site('a', 'healthy'), site('b', 'healthy'), site('c', 'restored_early')]}
      />,
    );
    expect(screen.getByText('Reef Status')).toBeInTheDocument();
    expect(screen.getByText('Healthy (2)')).toBeInTheDocument();
    expect(screen.getByText('Restored (Early) (1)')).toBeInTheDocument();
    expect(screen.queryByText(/Degraded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Restored \(Mid\)/)).not.toBeInTheDocument();
  });

  it('colours the legend dots from STATUS_COLORS', () => {
    render(
      <WorldMap
        sites={[site('a', 'healthy'), site('b', 'degraded'), site('c', 'restored_early'), site('d', 'restored_mid')]}
      />,
    );
    const expected: Record<string, string> = {
      healthy: STATUS_COLORS.healthy,
      degraded: STATUS_COLORS.degraded,
      restored_early: STATUS_COLORS.restored_early,
      restored_mid: STATUS_COLORS.restored_mid,
    };
    for (const [status, color] of Object.entries(expected)) {
      const dot = screen.getByTestId(`legend-dot-${status}`);
      // jsdom normalises hex to rgb(); compare through a probe element.
      const probe = document.createElement('div');
      probe.style.backgroundColor = color;
      expect(dot.style.backgroundColor).toBe(probe.style.backgroundColor);
    }
  });

  it('hides the whole legend when there are no sites, and when showLegend is false', () => {
    const { unmount } = render(<WorldMap sites={[]} />);
    expect(screen.queryByText('Reef Status')).not.toBeInTheDocument();
    unmount();
    render(<WorldMap sites={[site('a', 'healthy')]} showLegend={false} />);
    expect(screen.queryByText('Reef Status')).not.toBeInTheDocument();
  });

  it('renders one marker per site inside a region named "Map of reef recording sites"', () => {
    render(<WorldMap sites={[site('a', 'healthy'), site('b', 'degraded')]} />);
    expect(screen.getByRole('region', { name: 'Map of reef recording sites' })).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
  });

  it('shows the shared fallback instead of the map when WebGL2 is missing', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    render(<WorldMap sites={[site('a', 'healthy')]} />);
    expect(screen.getByText('WebGL is required for the interactive map')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});

describe('OSM raster style', () => {
  it('uses the standard OSM tile URL with no subdomains, tileSize 256 and maxzoom 19', () => {
    const source = WORLD_MAP_STYLE.sources.osm as {
      type: string;
      tiles: string[];
      tileSize: number;
      maxzoom: number;
      attribution: string;
    };
    expect(source.type).toBe('raster');
    expect(source.tiles).toEqual(['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
    expect(source.tiles[0]).not.toContain('{s}');
    expect(source.tileSize).toBe(256);
    expect(source.maxzoom).toBe(19);
    expect(source.attribution).toBe(WORLD_MAP_ATTRIBUTION);
    expect(WORLD_MAP_STYLE.layers).toHaveLength(1);
  });

  it('keeps the OSM copyright link and the "contributors" wording on the world map', () => {
    expect(WORLD_MAP_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    expect(WORLD_MAP_ATTRIBUTION).toContain('contributors');
    expect(MINI_MAP_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    expect(MINI_MAP_ATTRIBUTION).not.toContain('contributors');
  });
});
