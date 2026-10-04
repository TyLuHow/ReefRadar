import type { ReactNode } from 'react';

/**
 * One cell of a section's state grid (DS-08). It names its state in an eyebrow and carries
 * data-fixture-primitive and data-fixture-state, which the state-manifest test and the screenshot
 * specs address. data-screen marks it as a screen boundary for the checks that count blocks per
 * screen (AccentBlock). A cell showing a hover, focus or pressed state through a forced data
 * attribute says "(forced)" in its eyebrow, and any forced cell says "State forced for review".
 */

export interface StateCellProps {
  /** The primitive (or foundation topic) under review, as in the section slug. */
  primitive: string;
  /** The state id, lower case with hyphens, for example "default", "hover" or "one-value". */
  state: string;
  /** True when the state is applied to real data through a forced data attribute or prop. */
  forced?: boolean;
  /** `full` makes a wide primitive span every column of the grid. */
  span?: 'full';
  /** A line under the cell content, for example what was forced. */
  note?: ReactNode;
  children?: ReactNode;
}

const FORCED_SUFFIX_STATES = new Set(['hover', 'focus', 'pressed']);

export function stateEyebrow(state: string, forced: boolean): string {
  const label = state.replace(/[-_]+/g, ' ').toUpperCase();
  return forced && FORCED_SUFFIX_STATES.has(state) ? `${label} (forced)` : label;
}

export function StateCell({ primitive, state, forced = false, span, note, children }: StateCellProps) {
  return (
    <div
      data-fixture-primitive={primitive}
      data-fixture-state={state}
      data-screen={`${primitive}/${state}`}
      className={span === 'full' ? 'col-span-full min-w-0 bg-panel p-5' : 'min-w-0 bg-panel p-5'}
    >
      <p className="type-eyebrow text-muted">{stateEyebrow(state, forced)}</p>
      <div className="mt-3">{children}</div>
      {forced ? <p className="text-small text-muted mt-3">State forced for review</p> : null}
      {note ? <p className="text-small text-muted mt-2">{note}</p> : null}
    </div>
  );
}
