'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * LoadingState (DS-05, UI-SPEC "Empty, Error, Loading (state primitives)").
 *
 * A status region (`role="status"`) holding Skeleton blocks sized to the final layout and a visible
 * text label. It does not set `aria-busy`: on a live region that flag tells assistive technology to
 * defer announcing changes, and this region is removed (never cleared) when loading ends, so the label
 * and the long-wait message would never be spoken. A caller that wants a busy marker sets `aria-busy`
 * on the container being loaded. There is no spinner and no animation. After 8 s the label is
 * replaced by "This is taking longer than usual." so a long wait is stated, not hidden; the wait is
 * not given a number or a guess at how much is left.
 *
 * `elapsedMs` is for a caller that already tracks how long it has been waiting (and for the fixtures
 * route, which shows the long-wait state without waiting 8 s): at 8000 or more the long label shows
 * at once. The component's own single timer is cleared on unmount.
 */

export const LONG_WAIT_MS = 8000;
export const LONG_WAIT_LABEL = 'This is taking longer than usual.';

export interface LoadingStateProps {
  /** What is loading, as words ("Loading recording…"). */
  label: string;
  /** Skeleton blocks sized to the final layout. */
  children?: ReactNode;
  elapsedMs?: number;
  className?: string;
}

export function LoadingState({ label, children, elapsedMs, className }: LoadingStateProps) {
  const [timerElapsed, setTimerElapsed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTimerElapsed(true), LONG_WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  const long = timerElapsed || (elapsedMs !== undefined && elapsedMs >= LONG_WAIT_MS);

  return (
    <div role="status" className={clsx('flex flex-col gap-3 text-start', className)}>
      {children}
      <p className="text-small text-muted">{long ? LONG_WAIT_LABEL : label}</p>
    </div>
  );
}
