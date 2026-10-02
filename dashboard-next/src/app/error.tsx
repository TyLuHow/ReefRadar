'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { reportClientError } from '@/features/monitoring';

interface RouteErrorProps {
  error: Error & { digest?: string };
  /** Next 16.3 stable recovery: re-fetch and re-render the segment. */
  retry: () => void;
  reset: () => void;
}

/**
 * Route-level error page (PLAT-09, UI-SPEC "Client Error UI"). Renders inside
 * the root layout, so Navbar and Footer stay. Shows only the digest: the error
 * message and stack can contain URLs or data and are never rendered.
 */
export default function RouteError({ error, retry }: RouteErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const digest = error.digest;

  useEffect(() => {
    reportClientError(error, { source: 'error-boundary', digest: digest ?? null });
  }, [error, digest]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="px-4" style={{ paddingTop: 48, paddingBottom: 48 }}>
      <div
        className="glass-panel mx-auto"
        style={{ maxWidth: 560, width: '100%', padding: 24, boxSizing: 'border-box' }}
      >
        <AlertTriangle size={32} aria-hidden="true" style={{ color: '#c08081' }} />
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: '#e5e1db', marginTop: 16 }}
        >
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: '#a8a29e', marginTop: 8 }}>
          This page could not be displayed. Try again, or go back to the home page.
        </p>
        {digest ? (
          <p
            className="mono"
            style={{
              fontSize: 12,
              color: '#6b6560',
              textTransform: 'none',
              letterSpacing: 'normal',
              overflowWrap: 'anywhere',
              marginTop: 12,
            }}
          >
            {`Error reference: ${digest}`}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: '#cd853f',
              color: '#1a1714',
              padding: '8px 16px',
              borderRadius: 9999,
              minHeight: 44,
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link href="/" style={{ color: '#e5e1db', textDecoration: 'underline', fontSize: 14 }}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
