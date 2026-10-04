import clsx from 'clsx';

/**
 * Skeleton (DS-05, UI-SPEC "Skeleton"): a static block sized by the caller to the final content so
 * nothing shifts when the real content arrives. No animation, no shimmer: loading is stated in words
 * by LoadingState, and a moving block would need its own reduced-motion rule.
 *
 * The fill depends on the surface it sits on: `track` on the page ground, `panel-hover` on a panel,
 * `well-raised` inside a well.
 */

export type SkeletonSurface = 'ground' | 'panel' | 'well';

export interface SkeletonProps {
  /** The surface behind the block; picks the fill so it stays visible without being loud. */
  on?: SkeletonSurface;
  /** Size it here (`h-10 w-full`) to the final content. */
  className?: string;
}

const FILL: Record<SkeletonSurface, string> = {
  ground: 'bg-track',
  panel: 'bg-panel-hover',
  well: 'bg-well-raised',
};

export function Skeleton({ on = 'ground', className }: SkeletonProps) {
  return <div aria-hidden="true" className={clsx('rounded-surface', FILL[on], className)} />;
}
