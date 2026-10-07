'use client';

import clsx from 'clsx';
import { useContext, useState, type ReactNode } from 'react';
import {
  Tooltip as RacTooltip,
  TooltipTrigger,
  TooltipTriggerStateContext,
  type TooltipProps as RacTooltipProps,
} from 'react-aria-components';
import { overlayContainer } from './Dialog';

/**
 * Tooltip and TooltipSurface (DS-04, UI-SPEC "Tooltip").
 *
 * A tooltip only repeats or supplements information: touch devices never show one, so anything a
 * user needs must also exist in the page. It opens after `delay` ms of hover or at once on keyboard
 * focus, and closes on blur, pointer leave and Escape (React Aria behaviour). No arrow.
 * Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom
 * colour and size names (see Button.tsx).
 *
 * A live tooltip portals into the instrument surface root when one exists (as Dialog and the other
 * overlays do), so the font variables the layout puts on that subtree, the reset rules and the
 * reduced-motion attribute reach it; otherwise it falls to `document.body`.
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

/**
 * A React Aria Tooltip that portals into the instrument surface. The surface root is looked up when
 * the tooltip opens, not at first render (see SurfaceModalOverlay in Dialog.tsx for why).
 */
function SurfaceRacTooltip(props: Omit<RacTooltipProps, 'UNSTABLE_portalContainer'>) {
  const open = useContext(TooltipTriggerStateContext)?.isOpen === true;
  const [held, setHeld] = useState<HTMLElement | undefined>(undefined);
  if (open && (held === undefined || !held.isConnected)) {
    const next = overlayContainer();
    if (next !== held) setHeld(next);
  }
  return <RacTooltip {...props} UNSTABLE_portalContainer={held} />;
}

/** A hover and focus tooltip around a focusable React Aria trigger. */
export function Tooltip({ content, children, delay = 300, placement = 'top', isOpen, defaultOpen }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} isOpen={isOpen} defaultOpen={defaultOpen}>
      {children}
      <SurfaceRacTooltip offset={8} placement={placement} className={clsx(BOX, OVERLAY_MOTION)}>
        {content}
      </SurfaceRacTooltip>
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
