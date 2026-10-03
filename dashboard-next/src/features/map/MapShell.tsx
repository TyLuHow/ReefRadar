'use client';

import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { reportClientError } from '@/features/monitoring';

// --- Reduced-motion detection ------------------------------------------------

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// --- WebGL2 detection --------------------------------------------------------

/** MapLibre 6 needs WebGL2: a context from `webgl2` only counts as supported. */
export function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    // Release the probe context so repeated checks never exhaust the browser's context limit.
    (gl as WebGL2RenderingContext).getExtension?.('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const subscribeNever = () => () => {};

// --- WebGL fallback UI -------------------------------------------------------

function WebGLFallback({ height, compact = false }: { height: string; compact?: boolean }) {
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
        gap: compact ? '8px' : '16px',
        padding: compact ? '16px' : '32px',
      }}
    >
      <svg
        width={compact ? 32 : 48}
        height={compact ? 32 : 48}
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
      {!compact && (
        <p style={{ color: '#a8a29e', fontSize: '13px', textAlign: 'center', maxWidth: '360px' }}>
          Your browser or device does not support WebGL, which is needed to render
          the 3D map. Please try a recent version of Chrome, Edge, or Safari.
        </p>
      )}
    </div>
  );
}

// --- Failure panel and error boundary ------------------------------------------

/** Shown when the map cannot be displayed: a render error, or a fatal map error (see isFatalMapError). */
function MapFailurePanel({ height }: { height: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height,
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
        The map could not be displayed. This can happen with a blocked network request, certain
        GPU drivers or browser configurations. Try reloading or using a
        different browser.
      </p>
    </div>
  );
}

interface MapErrorBoundaryProps {
  height: string;
  children: React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ReefMap] Map render error:', error, info);
    // PLAT-09: the one component most likely to fail must reach the monitoring endpoint too.
    reportClientError(error, { source: 'error-boundary' });
  }

  render() {
    if (this.state.hasError) {
      return <MapFailurePanel height={this.props.height} />;
    }
    return this.props.children;
  }
}

// --- Map error events ----------------------------------------------------------

/** The slice of a react-map-gl `ErrorEvent` this shell reads. */
export interface MapErrorEventLike {
  error?: unknown;
  target?: unknown;
}

/** Handler a map passes as its `onError` prop (children of MapShell receive it). */
export type MapErrorHandler = (event: MapErrorEventLike) => void;

/**
 * react-maplibre catches a failed map initialisation in a promise and hands it to `onError`
 * with `target: null` (no map instance exists); nothing is thrown into React. That is fatal,
 * as is a failure to load the style document itself. A tile, sprite or glyph error is not:
 * the map still works, so it is reported but the map stays.
 */
export function isFatalMapError(event: MapErrorEventLike, styleUrl?: string): boolean {
  if (event.target === null || event.target === undefined) return true;
  const url = (event.error as { url?: unknown } | null | undefined)?.url;
  return styleUrl !== undefined && typeof url === 'string' && url === styleUrl;
}

// --- Shell -------------------------------------------------------------------

interface MapShellProps {
  height: string;
  className?: string;
  /** Accessible name of the map region (for example "Monitoring network map"). */
  ariaLabel: string;
  /** Small-map variant of the WebGL fallback: icon and the single line only (MiniMap, 200px). */
  compactFallback?: boolean;
  /** URL of the style document, when the map loads one; a failure to fetch it counts as fatal. */
  styleUrl?: string;
  /**
   * The map, or a function that receives the `onError` handler to pass to every `<Map>`.
   * The handler reports each map error and swaps in the failure panel when the error is fatal.
   */
  children: React.ReactNode | ((onMapError: MapErrorHandler) => React.ReactNode);
}

/**
 * Shared map frame: WebGL2 check, "Initializing map..." while it runs, the fallback
 * panel when WebGL2 is missing, an error boundary around the map, and a role=region
 * wrapper carrying the accessible name.
 */
export function MapShell({ height, className, ariaLabel, compactFallback = false, styleUrl, children }: MapShellProps) {
  const [failed, setFailed] = useState(false);
  const onMapError = useCallback<MapErrorHandler>(
    (event) => {
      reportClientError(event.error ?? new Error('Map error'), { source: 'error-boundary' });
      if (isFatalMapError(event, styleUrl)) setFailed(true);
    },
    [styleUrl],
  );

  // false on the server and during hydration, true once on the client: detection runs
  // after that point, exactly once per mount, without a setState-in-effect.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const webglSupported = useMemo<boolean | null>(
    () => (mounted ? detectWebGL2Support() : null),
    [mounted],
  );

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

  // WebGL2 not supported: show the fallback
  if (!webglSupported) {
    return (
      <div className={className}>
        <WebGLFallback height={height} compact={compactFallback} />
      </div>
    );
  }

  // A fatal map error (init or style failure) replaces the blank map with the failure panel.
  if (failed) {
    return (
      <div className={className} role="region" aria-label={ariaLabel}>
        <MapFailurePanel height={height} />
      </div>
    );
  }

  return (
    <div className={className} role="region" aria-label={ariaLabel}>
      <MapErrorBoundary height={height}>
        <div
          style={{
            position: 'relative',
            height,
            width: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {typeof children === 'function' ? children(onMapError) : children}
        </div>
      </MapErrorBoundary>
    </div>
  );
}
