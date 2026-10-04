import clsx from 'clsx';

/**
 * Stat (DS-05, UI-SPEC "Stat (numeral)"): a very large numeral with a 16 px label beside it,
 * baseline aligned. The value is a number the caller computed from data (site count, status count);
 * it is typed as `number` so a preformatted or typed-in string cannot be passed. A value that is not
 * a finite number shows a dash rather than anything that looks like a measurement.
 *
 * The numeral face, size, tracking and line height come from the direction's `numeral` tokens.
 */

const GROUPED = new Intl.NumberFormat('en');

export interface StatProps {
  value: number;
  label: string;
  /** Replaces the default grouped-digits format ("12,345"). */
  format?: (value: number) => string;
  className?: string;
}

export function Stat({ value, label, format, className }: StatProps) {
  const shown = Number.isFinite(value) ? (format ?? GROUPED.format)(value) : '–';
  return (
    <p className={clsx('flex items-baseline gap-4 text-start', className)}>
      <span className="font-numeral text-numeral tabular">{shown}</span>
      <span className="max-w-[12ch] text-body">{label}</span>
    </p>
  );
}
