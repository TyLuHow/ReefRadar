'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Dialog as RacDialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import {
  CloseButton,
  OVERLAY_SCRIM,
  OVERLAY_TITLE,
  OverlayBody,
  PanelLayout,
  overlayContainer,
  type OverlayBodyStateProps,
} from './Dialog';

/**
 * Sheet and SheetSurface (DS-04, UI-SPEC "Sheet").
 *
 * An edge panel on the same React Aria Components overlay as Dialog (`ModalOverlay`, `Modal`,
 * `Dialog`), so the focus contract is the Dialog's: focus moves in and is trapped, Escape, the
 * close button and a scrim press each dismiss it, and focus returns to the trigger. `right` is for
 * tablet and desktop (width `min(420px, 100%)`), `bottom` for phone (height auto, at most 85dvh,
 * square top corners). The heavy rule is on the leading edge, the fill is `ground`, there is no
 * shadow and no handle: it is not draggable.
 *
 * It enters and leaves by moving 24 px from its edge while fading, over `--duration-base`, which
 * computes to 0ms under reduced motion, so the change is then instant. The `ltr:` and `rtl:` pair
 * keeps the right-hand sheet moving from its own edge in either writing direction. `SheetSurface`
 * draws the same panel as a plain element for the open-state cells of the fixtures route.
 */

export type SheetSide = 'right' | 'bottom';

// Border widths use the rule token so the heavy rule follows the direction (3 px, 1 px or 6 px).
const SIDE: Record<SheetSide, { panel: string; surface: string; motion: string }> = {
  right: {
    panel: 'absolute inset-y-0 end-0 w-[min(420px,100%)] border-s-(length:--rule-w-heavy) border-rule-heavy',
    surface: 'w-full max-w-[420px] border-s-(length:--rule-w-heavy) border-rule-heavy',
    motion:
      'data-entering:ltr:translate-x-6 data-entering:rtl:-translate-x-6 data-exiting:ltr:translate-x-6 data-exiting:rtl:-translate-x-6',
  },
  bottom: {
    panel: 'absolute inset-x-0 bottom-0 max-h-[85dvh] border-t-(length:--rule-w-heavy) border-rule-heavy',
    surface: 'w-full max-h-[85dvh] border-t-(length:--rule-w-heavy) border-rule-heavy',
    motion: 'data-entering:translate-y-6 data-exiting:translate-y-6',
  },
};

const PANEL_BASE = 'flex flex-col bg-ground text-ink font-body text-body outline-none';
const PANEL_MOTION =
  'transition-[opacity,translate] duration-(--duration-base) ease-(--ease) data-entering:opacity-0 data-exiting:opacity-0';

export interface SheetProps extends OverlayBodyStateProps {
  /** `right` on tablet and desktop, `bottom` on phone. */
  side: SheetSide;
  /** The sheet's name and visible title. */
  title: string;
  children?: ReactNode;
  /** The control that opens it: a React Aria Components element (Button, LinkButton, ToggleButton). Focus returns here. */
  trigger?: ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** An edge panel with Dialog's focus contract, dismissed by the close button, a scrim press or Escape. */
export function Sheet({ side, title, children, trigger, isOpen, defaultOpen, onOpenChange, ...bodyProps }: SheetProps) {
  return (
    <DialogTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger}
      <ModalOverlay isDismissable UNSTABLE_portalContainer={overlayContainer()} className={OVERLAY_SCRIM}>
        <Modal className={clsx(PANEL_BASE, SIDE[side].panel, PANEL_MOTION, SIDE[side].motion)}>
          <RacDialog className="flex min-h-0 flex-1 flex-col outline-none">
            {({ close }) => (
              <PanelLayout
                label={title}
                heading={
                  <Heading slot="title" className={OVERLAY_TITLE}>
                    {title}
                  </Heading>
                }
                closeButton={<CloseButton onPress={close} />}
              >
                <OverlayBody {...bodyProps}>{children}</OverlayBody>
              </PanelLayout>
            )}
          </RacDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

export interface SheetSurfaceProps extends OverlayBodyStateProps {
  side: SheetSide;
  title: string;
  children?: ReactNode;
  /** The heading element, so the page outline stays honest (the live sheet title is an h2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** The sheet panel as a plain element (no overlay, no role), for static open-state cells. `className` sizes it. */
export function SheetSurface({ side, title, children, headingLevel = 3, className, ...bodyProps }: SheetSurfaceProps) {
  const HeadingTag = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div data-sheet-surface="" data-side={side} className={clsx(PANEL_BASE, SIDE[side].surface, className)}>
      <PanelLayout label={title} heading={<HeadingTag className={OVERLAY_TITLE}>{title}</HeadingTag>} closeButton={<CloseButton />}>
        <OverlayBody {...bodyProps}>{children}</OverlayBody>
      </PanelLayout>
    </div>
  );
}
