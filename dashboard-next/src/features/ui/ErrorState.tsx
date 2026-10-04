'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button, LinkButton } from './Button';

/**
 * ErrorState (DS-05, UI-SPEC "Empty, Error, Loading (state primitives)").
 *
 * Errors are marked by words, a 3 px ink bar on the start edge and the eyebrow "ERROR": no icon and
 * no red. Copy pattern: heading says what failed, body says what to do next. Only text the caller
 * passes is rendered; an error message or stack is never shown (the route error-page rule).
 *
 * `announce` is `alert` when the error appears after a user action and `status` when it replaces
 * content on load. After a user action also pass `focusOnMount` so focus moves to the heading
 * (`tabindex="-1"`: focusable by script, not a tab stop).
 *
 * A `requestId` shows "Request id: {id}" and a Copy button. The id is written to the clipboard only
 * on that explicit press, and the result is stated in a polite live region ("Copied", or that the
 * clipboard refused, so the primitive never claims a copy that did not happen).
 */

export interface ErrorStateProps {
  /** What happened, as a sentence. */
  title: string;
  /** What to do next, as a sentence. */
  body: string;
  requestId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  link?: { label: string; href: string };
  announce?: 'alert' | 'status';
  focusOnMount?: boolean;
  /** The heading element, so the page outline stays honest. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function ErrorState({
  title,
  body,
  requestId,
  onRetry,
  retryLabel = 'Retry',
  link,
  announce = 'status',
  focusOnMount = false,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copy, setCopy] = useState<CopyState>('idle');

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  async function copyRequestId() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';

  const hasActions = Boolean(requestId || onRetry || link);

  return (
    <div role={announce} className={clsx('border-s-[3px] border-ink ps-4 text-start', className)}>
      <p className="type-eyebrow text-muted">ERROR</p>
      <Heading ref={headingRef} tabIndex={-1} className="text-body font-semibold text-ink">
        {title}
      </Heading>
      <p className="text-body text-ink">{body}</p>
      {requestId ? <p className="font-data text-small text-muted mt-2 break-all">{`Request id: ${requestId}`}</p> : null}
      {hasActions ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {requestId ? (
            <Button variant="secondary" onPress={copyRequestId}>
              Copy request id
            </Button>
          ) : null}
          {onRetry ? (
            <Button variant="secondary" onPress={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {link ? (
            <LinkButton variant="quiet" href={link.href}>
              {link.label}
            </LinkButton>
          ) : null}
        </div>
      ) : null}
      {requestId ? (
        <span aria-live="polite" className="font-data text-small text-muted mt-2 block min-h-6">
          {copy === 'copied' ? 'Copied' : copy === 'failed' ? 'The request id could not be copied. Select it and copy it by hand.' : ''}
        </span>
      ) : null}
    </div>
  );
}
