'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Tooltip as RacTooltip, TooltipTrigger, type TooltipProps as RacTooltipProps } from 'react-aria-components';

/**
 * Tooltip and TooltipSurface (DS-04, UI-SPEC "Tooltip").
 *
 * A tooltip only repeats or supplements information: touch devices never show one, so anything a
 * user needs must also exist in the page. It opens after `delay` ms of hover or at once on keyboard
 * focus, and closes on blur, pointer leave and Escape (React Aria behaviour). No arrow.
 * Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom
 * colour and size names (see Button.tsx).
 */

// The visual box, shared by the live tooltip and the static surface.
const BOX = 'bg-control text-on-control text-small font-body px-3 py-2 max-w-[280px] rounded-control break-words';

// Opacity moves between the entering and exiting states and the settled state; the duration token
// computes to 0ms under reduced motion, so the change is then instant.
const OVERLAY_MOTION =
  'transition-opacity duration-(--duration-base) ease-(--ease) data-entering:opacity-0 data-exiting:opacity-0';

export interface TooltipProps {
  /** Static text. Interactive content does not belong in a tooltip. */
  content: ReactNode;
  /** The trigger. It must be a focusable React Aria Components element (Button, LinkButton, ToggleButton, ...). */
  children: ReactNode;
  /** Hover delay in milliseconds before it opens (keyboard focus opens it at once). */
  delay?: number;
  placement?: RacTooltipProps['placement'];
  /** Controlled open state. */
  isOpen?: boolean;
  defaultOpen?: boolean;
}

/** A hover and focus tooltip around a focusable React Aria trigger. */
export function Tooltip({ content, children, delay = 300, placement = 'top', isOpen, defaultOpen }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} isOpen={isOpen} defaultOpen={defaultOpen}>
      {children}
      <RacTooltip offset={8} placement={placement} className={clsx(BOX, OVERLAY_MOTION)}>
        {content}
      </RacTooltip>
    </TooltipTrigger>
  );
}

/** The tooltip box with no overlay behaviour, for static open-state cells on the fixtures route. */
export function TooltipSurface({ children }: { children: ReactNode }) {
  return (
    <div role="tooltip" className={BOX}>
      {children}
    </div>
  );
}
