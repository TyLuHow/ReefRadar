import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * RLabel (DS-05, UI-SPEC "R-LABEL (assigned versus inferred)").
 *
 * Anything assigned by a dataset's authors is a "reference label": a solid 1 px ink rule on the
 * start edge and the eyebrow REFERENCE LABEL. Anything inferred by the model is a "model reading":
 * a dashed 1 px ink rule and the eyebrow MODEL READING. The two differ by rule style and by words,
 * never by colour alone, so they stay distinct in greyscale and for colour-blind readers.
 */

export type RLabelKind = 'reference' | 'model';

export interface RLabelProps {
  kind: RLabelKind;
  children?: ReactNode;
  className?: string;
}

const EYEBROW: Record<RLabelKind, string> = {
  reference: 'REFERENCE LABEL',
  model: 'MODEL READING',
};

export function RLabel({ kind, children, className }: RLabelProps) {
  return (
    <div className={clsx('border-s border-ink ps-3 text-start', kind === 'reference' ? 'border-solid' : 'border-dashed', className)}>
      <p className="type-eyebrow text-muted">{EYEBROW[kind]}</p>
      {children}
    </div>
  );
}
