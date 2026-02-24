'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import ReactMapGL from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Site, ReefStatus } from '@/types';
import { SitePopup } from './SitePopup';

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW_STATE = {
  latitude: 0,
  longitude: 80,
  zoom: 2,
  pitch: 30,
  bearing: 0,
};

const STATUS_COLORS_RGB: Record<ReefStatus, [number, number, number]> = {
  healthy: [205, 133, 63],
  degraded: [107, 101, 96],
  restored_early: [139, 115, 85],
  restored_mid: [192, 128, 129],
};

// --- WebGL support detection -------------------------------------------------

function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

// --- WebGL fallback UI -------------------------------------------------------

function WebGLFallback({ height }: { height: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height,
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'rgba(26, 23, 20, 0.6)',
        border: '1px solid rgba(229, 225, 219, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '32px',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#cd853f"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <p style={{ color: '#e9dcc9', fontSize: '16px', fontWeight: 500, textAlign: 'center' }}>
        WebGL is required for the interactive map
      </p>
      <p style={{ color: '#a8a29e', fontSize: '13px', textAlign: 'center', maxWidth: '360px' }}>
        Your browser or device does not support WebGL, which is needed to render
        the 3D map. Please try a recent version of Chrome, Edge, or Safari.
      </p>
    </div>
  );
}

// --- Error boundary for DeckGL -----------------------------------------------

interface ErrorBoundaryProps {
  height: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class DeckGLErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ReefMap] DeckGL render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'relative',
            height: this.props.height,
            width: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'rgba(26, 23, 20, 0.6)',
            border: '1px solid rgba(192, 128, 129, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '32px',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c08081"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <p style={{ color: '#e9dcc9', fontSize: '15px', fontWeight: 500, textAlign: 'center' }}>
            Map failed to initialize
          </p>
          <p style={{ color: '#a8a29e', fontSize: '13px', textAlign: 'center', maxWidth: '360px' }}>
            The WebGL context could not be created. This can happen with certain
            GPU drivers or browser configurations. Try reloading or using a
            different browser.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main ReefMap component --------------------------------------------------

interface ReefMapProps {
  sites: Site[];
  selectedSite?: Site | null;
  onSiteSelect?: (site: Site | null) => void;
  className?: string;
  height?: string;
}

export function ReefMap({
  sites,
  selectedSite: externalSelectedSite,
  onSiteSelect,
  className,
  height = '600px',
}: ReefMapProps) {
  const [internalSelectedSite, setInternalSelectedSite] =
    useState<Site | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  // Detect WebGL support after mount (client-side only)
  useEffect(() => {
    setWebglSupported(detectWebGLSupport());
  }, []);

  const selectedSite =
    externalSelectedSite !== undefined
      ? externalSelectedSite
      : internalSelectedSite;

  const handleSelect = useCallback(
    (site: Site | null) => {
      if (onSiteSelect) {
        onSiteSelect(site);
      } else {
        setInternalSelectedSite(site);
      }
    },
    [onSiteSelect],
  );

  // Sites with valid coordinates
  const validSites = useMemo(
    () =>
      sites.filter(
        (s) => s.latitude !== undefined && s.longitude !== undefined,
      ),
    [sites],
  );

  const layers = useMemo(() => {
    // Glow layer (larger, semi-transparent)
    const glowLayer = new ScatterplotLayer<Site>({
      id: 'sites-glow',
      data: validSites,
      getPosition: (d: Site) => [d.longitude!, d.latitude!],
      getRadius: 2000,
      getFillColor: (d: Site) => {
        const rgb = STATUS_COLORS_RGB[d.status] || [136, 136, 136];
        return [rgb[0], rgb[1], rgb[2], 80] as [
          number,
          number,
          number,
          number,
        ];
      },
      radiusMinPixels: 12,
      radiusMaxPixels: 40,
      pickable: false,
    });

    // Core layer (smaller, full opacity)
    const coreLayer = new ScatterplotLayer<Site>({
      id: 'sites-core',
      data: validSites,
      getPosition: (d: Site) => [d.longitude!, d.latitude!],
      getRadius: (d: Site) =>
        hoveredSiteId === d.site_id || selectedSite?.site_id === d.site_id
          ? 1200
          : 800,
      getFillColor: (d: Site) => {
        const rgb = STATUS_COLORS_RGB[d.status] || [136, 136, 136];
        return [rgb[0], rgb[1], rgb[2], 230] as [
          number,
          number,
          number,
          number,
        ];
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 24,
      pickable: true,
      onClick: (info: { object?: Site }) => {
        if (info.object) {
          handleSelect(info.object);
        }
      },
      onHover: (info: { object?: Site }) => {
        setHoveredSiteId(info.object?.site_id ?? null);
      },
      updateTriggers: {
        getRadius: [hoveredSiteId, selectedSite?.site_id],
      },
    });

    return [glowLayer, coreLayer];
  }, [validSites, hoveredSiteId, selectedSite, handleSelect]);

  // Still detecting WebGL support
  if (webglSupported === null) {
    return (
      <div
        className={className}
        style={{
          position: 'relative',
          height,
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'rgba(26, 23, 20, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#a8a29e', fontSize: '14px' }}>Initializing map...</p>
      </div>
    );
  }

  // WebGL not supported -- show fallback
  if (!webglSupported) {
    return (
      <div className={className}>
        <WebGLFallback height={height} />
      </div>
    );
  }

  return (
    <div className={className}>
      <DeckGLErrorBoundary height={height}>
        <div
          style={{
            position: 'relative',
            height,
            width: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <DeckGL
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
            getCursor={({ isHovering }: { isHovering: boolean }) =>
              isHovering ? 'pointer' : 'grab'
            }
            onError={(error: Error) => {
              console.error('[ReefMap] DeckGL error:', error);
            }}
          >
            <ReactMapGL mapStyle={MAP_STYLE} />
          </DeckGL>

          {/* Selected site popup */}
          {selectedSite && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
              }}
            >
              <SitePopup
                site={selectedSite}
                onClose={() => handleSelect(null)}
              />
            </div>
          )}
        </div>
      </DeckGLErrorBoundary>
    </div>
  );
}
