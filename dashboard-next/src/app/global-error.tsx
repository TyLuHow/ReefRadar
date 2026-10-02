'use client';

import { useEffect, useRef } from 'react';
import { reportClientError } from '@/features/monitoring';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}

// Tailwind and globals.css are not loaded when the root layout fails: static inline styles only.
const FOCUS_RING = 'outline:2px solid #cd853f;outline-offset:2px';

/**
 * Root-layout failure page (PLAT-09, UI-SPEC "Client Error UI"). Replaces the
 * whole document, so it owns <html> and <body>. Shows only the digest: the
 * error message and stack are never rendered.
 */
export default function GlobalError({ error }: GlobalErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const digest = error.digest;

  useEffect(() => {
    reportClientError(error, { source: 'global-error', digest: digest ?? null });
  }, [error, digest]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang="en">
      <head>
        {/* Focus ring for the two focusable elements; inline-only styling cannot express :focus-visible. */}
        <style>{`h1:focus-visible,button:focus-visible{${FOCUS_RING}}`}</style>
      </head>
      <body
        style={{
          margin: 0,
          background: '#1a1714',
          color: '#e5e1db',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <main style={{ padding: '48px 16px' }}>
          <div
            style={{
              maxWidth: 560,
              width: '100%',
              boxSizing: 'border-box',
              margin: '0 auto',
              padding: 24,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(229,225,219,0.1)',
              borderRadius: 16,
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c08081"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <h1
              ref={headingRef}
              tabIndex={-1}
              style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: '#e5e1db', margin: '16px 0 0' }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: '#a8a29e', margin: '8px 0 0' }}>
              ReefRadar could not load. Reload the page, or try again in a few minutes.
            </p>
            {digest ? (
              <p
                style={{
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                  fontSize: 12,
                  color: '#6b6560',
                  overflowWrap: 'anywhere',
                  margin: '12px 0 0',
                }}
              >
                {`Error reference: ${digest}`}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 24,
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
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
