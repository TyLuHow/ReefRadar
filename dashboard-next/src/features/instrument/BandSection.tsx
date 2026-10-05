import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * BandSection (DS-05, UI-SPEC "BandSection"): a full-bleed section on the `band` surface with
 * `on-band` text. It can carry an eyebrow, a display-xl headline and any children (a large
 * Transport, a hero Spectrogram edge to edge). The headline's face, case, style and tracking come
 * from the direction's display tokens through `type-display`.
 */

export interface BandSectionProps {
  eyebrow?: string;
  headline?: ReactNode;
  /** The headline's heading level; pick the one that keeps the page outline honest. */
  headingLevel?: 1 | 2 | 3;
  children?: ReactNode;
  as?: 'section' | 'div' | 'header';
  className?: string;
}

export function BandSection({ eyebrow, headline, headingLevel = 2, children, as: Tag = 'section', className }: BandSectionProps) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <Tag className={clsx('w-full bg-band text-on-band', className)}>
      {eyebrow ? <p className="type-eyebrow text-on-band-muted">{eyebrow}</p> : null}
      {headline ? <Heading className={clsx('type-display text-display-xl', eyebrow && 'mt-4')}>{headline}</Heading> : null}
      {children}
    </Tag>
  );
}
