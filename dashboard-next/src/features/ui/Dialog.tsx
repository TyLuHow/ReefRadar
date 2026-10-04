'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dialog as RacDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  OverlayTriggerStateContext,
  type ModalOverlayProps,
} from 'react-aria-components';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { Skeleton } from './Skeleton';

/**
 * Dialog, AlertDialog and DialogSurface (DS-04, UI-SPEC "Dialog (modal and alertdialog)").
 *
 * Behaviour comes from React Aria Components (`ModalOverlay`, `Modal`, `Dialog`, `Heading`): focus
 * moves inside on open and is trapped (Tab and Shift+Tab cycle), the page behind is hidden from
 * assistive technology, Escape closes (a dialog) or cancels (an alertdialog) and focus returns to
 * the trigger. A scrim press closes a dialog; an alertdialog ignores it and starts on its safe
 * action. The look is semantic-token Tailwind utilities only: a scrim with no blur, a heavy top rule,
 * no shadow, the numeral face for the title (roman: dialog titles are never italic).
 *
 * The body scrolls under a fixed title row and a fixed action row, both separated from it by a
 * `rule`. Opacity moves with `--duration-base`, which computes to 0ms under reduced motion, so the
 * change is then instant. Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x
 * predates Tailwind 4's custom colour and size names (see Button.tsx).
 *
 * Overlays portal into the instrument surface root when one exists (so the font variables that the
 * layout puts on that subtree, the reset rules and the reduced-motion attribute all reach them) and
 * to `document.body` otherwise. `DialogSurface` draws the same panel as a plain element, for the
 * open-state cells of the fixtures route (an overlay would portal out of its cell).
 */

export type OverlayBodyState = 'loading' | 'error';

export interface OverlayBodyStateProps {
  /** Replaces the body with a Loading state or an Error state. */
  bodyState?: OverlayBodyState;
  /** What is loading, as words. */
  loadingLabel?: string;
  /** What failed, as a sentence (Error state heading). */
  errorTitle?: string;
  /** What to do next, as a sentence (Error state body). */
  errorBody?: string;
  /** Adds a Retry action to the Error state. */
  onRetry?: () => void;
}

/** The instrument surface root if one is mounted, so an overlay inherits its tokens and resets. */
export function overlayContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('[data-surface="instrument"]') ?? undefined;
}

/**
 * A ModalOverlay that portals into the instrument surface. The surface root is looked up when the
 * overlay opens, not when the trigger first renders: the prerendered page carries a fallback surface
 * that the client replaces, so a lookup at first render can return a node that is about to be
 * discarded (the overlay would then mount into a detached element and never appear).
 */
export function SurfaceModalOverlay(props: Omit<ModalOverlayProps, 'UNSTABLE_portalContainer'>) {
  const open = useContext(OverlayTriggerStateContext)?.isOpen === true;
  const [held, setHeld] = useState<HTMLElement | undefined>(undefined);
  if (open && (held === undefined || !held.isConnected)) {
    const next = overlayContainer();
    if (next !== held) setHeld(next);
  }
  return <ModalOverlay {...props} UNSTABLE_portalContainer={held} />;
}

/** The Loading or Error state a Dialog or Sheet shows in place of its body. */
export function OverlayBody({
  bodyState,
  loadingLabel = 'Loading…',
  errorTitle = 'This could not be loaded.',
  errorBody = 'Close this and try again.',
  onRetry,
  children,
}: OverlayBodyStateProps & { children?: ReactNode }) {
  if (bodyState === 'loading') {
    return (
      <LoadingState label={loadingLabel}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </LoadingState>
    );
  }
  if (bodyState === 'error') {
    return <ErrorState announce="status" headingLevel={3} title={errorTitle} body={errorBody} onRetry={onRetry} />;
  }
  return <>{children}</>;
}

/** The scrim: a full-screen layer in the scrim token with no blur; opacity follows the duration token. */
export const OVERLAY_SCRIM =
  'fixed inset-x-0 top-0 z-50 h-(--visual-viewport-height) bg-scrim ' +
  'transition-opacity duration-(--duration-base) ease-(--ease) data-entering:opacity-0 data-exiting:opacity-0';

/** The title face, shared by Dialog and Sheet: numeral face, roman, regular weight. */
export const OVERLAY_TITLE = 'font-numeral text-lead font-normal text-ink';

const PANEL_BASE = 'flex flex-col bg-ground text-ink font-body text-body outline-none';
const TITLE_ROW = 'flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-rule';
const ACTION_ROW = 'flex flex-wrap justify-end gap-3 px-6 py-4 border-t border-rule';

/**
 * The scrolling body. When its content is taller than the room it has, it becomes a focusable
 * labelled region so a keyboard user can scroll it (axe `scrollable-region-focusable`).
 */
function ScrollBody({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={overflows ? 0 : undefined}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? label : undefined}
      className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-body focus-visible:focus-ring-inset"
    >
      {children}
    </div>
  );
}

/** Title row, scrolling body and action row: the one layout of Dialog, AlertDialog and DialogSurface (and Sheet). */
export function PanelLayout({
  heading,
  closeButton,
  label,
  children,
  actions,
}: {
  heading: ReactNode;
  closeButton?: ReactNode;
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className={TITLE_ROW}>
        {heading}
        {closeButton}
      </div>
      <ScrollBody label={`${label} content`}>{children}</ScrollBody>
      {actions ? <div className={ACTION_ROW}>{actions}</div> : null}
    </>
  );
}

/** The 44 by 44 icon button that closes an overlay. */
export function CloseButton({ onPress }: { onPress?: () => void }) {
  return (
    <Button variant="icon" aria-label="Close" onPress={onPress}>
      <X aria-hidden="true" size={20} />
    </Button>
  );
}

type ActionsProp = ReactNode | ((helpers: { close: () => void }) => ReactNode);

interface DialogShellProps extends OverlayBodyStateProps {
  title: string;
  children?: ReactNode;
  actions?: ActionsProp;
  trigger?: ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  isDismissable: boolean;
  role: 'dialog' | 'alertdialog';
  showClose: boolean;
}

function DialogShell({
  title,
  children,
  actions,
  trigger,
  isOpen,
  defaultOpen,
  onOpenChange,
  isDismissable,
  role,
  showClose,
  ...bodyProps
}: DialogShellProps) {
  return (
    <DialogTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger}
      <SurfaceModalOverlay
        isDismissable={isDismissable}
        className={clsx(OVERLAY_SCRIM, 'flex items-center justify-center')}
      >
        <Modal
          className={clsx(
            PANEL_BASE,
            'rule-top-heavy rounded-surface w-[min(560px,calc(100%-32px))] max-h-[calc(100dvh-32px)]',
          )}
        >
          <RacDialog role={role} className="flex min-h-0 flex-1 flex-col outline-none">
            {({ close }) => (
              <PanelLayout
                label={title}
                heading={
                  <Heading slot="title" className={OVERLAY_TITLE}>
                    {title}
                  </Heading>
                }
                closeButton={showClose ? <CloseButton onPress={close} /> : null}
                actions={typeof actions === 'function' ? actions({ close }) : actions}
              >
                <OverlayBody {...bodyProps}>{children}</OverlayBody>
              </PanelLayout>
            )}
          </RacDialog>
        </Modal>
      </SurfaceModalOverlay>
    </DialogTrigger>
  );
}

export interface DialogProps extends OverlayBodyStateProps {
  /** The dialog's name and visible title. */
  title: string;
  children?: ReactNode;
  /** The action row, or a function that receives `close` for an action that dismisses it. */
  actions?: ActionsProp;
  /** The control that opens it: a React Aria Components element (Button, LinkButton, ToggleButton). Focus returns here. */
  trigger?: ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** A scrim press closes it (default). Escape always closes it. */
  isDismissable?: boolean;
}

/** A modal dialog: focus trapped, Escape closes, focus returns to the trigger. */
export function Dialog({ isDismissable = true, ...rest }: DialogProps) {
  return <DialogShell {...rest} isDismissable={isDismissable} role="dialog" showClose />;
}

export interface AlertDialogProps {
  title: string;
  /** What will happen, as a sentence. */
  body: string;
  /** The action that backs out. It takes initial focus. */
  safeLabel: string;
  /** The action that goes ahead, as verb plus noun ("Discard comparison"). Primary style, no hue. */
  confirmLabel: string;
  onConfirm?: () => void;
  trigger?: ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * An `alertdialog` for a decision. A scrim press does not close it; Escape cancels it (closes it
 * without calling `onConfirm`). Initial focus is on the safe action, then the confirm follows it,
 * right-aligned. There is no Close button: the decision is made with the two actions or Escape.
 */
export function AlertDialog({ title, body, safeLabel, confirmLabel, onConfirm, ...rest }: AlertDialogProps) {
  return (
    <DialogShell
      {...rest}
      title={title}
      isDismissable={false}
      role="alertdialog"
      showClose={false}
      actions={({ close }) => (
        <>
          <Button variant="secondary" autoFocus onPress={close}>
            {safeLabel}
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              onConfirm?.();
              close();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <p>{body}</p>
    </DialogShell>
  );
}

export interface DialogSurfaceProps extends OverlayBodyStateProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** `alertdialog` drops the Close button, as the live AlertDialog does. */
  variant?: 'dialog' | 'alertdialog';
  /** The heading element, so the page outline stays honest (the live dialog title is an h2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/**
 * The dialog panel as a plain element: same title row, body and action row, no overlay behaviour,
 * no role. For static open-state cells on the fixtures route; `className` sizes it (`max-h-80` to
 * show the scrolling state, a width for the phone state).
 */
export function DialogSurface({
  title,
  children,
  actions,
  variant = 'dialog',
  headingLevel = 3,
  className,
  ...bodyProps
}: DialogSurfaceProps) {
  const HeadingTag = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div data-dialog-surface="" className={clsx(PANEL_BASE, 'rule-top-heavy rounded-surface w-full max-w-[560px]', className)}>
      <PanelLayout
        label={title}
        heading={
          <HeadingTag className={OVERLAY_TITLE}>{title}</HeadingTag>
        }
        closeButton={variant === 'dialog' ? <CloseButton /> : null}
        actions={actions}
      >
        <OverlayBody {...bodyProps}>{children}</OverlayBody>
      </PanelLayout>
    </div>
  );
}
