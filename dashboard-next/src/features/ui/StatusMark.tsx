import { STATUS_PATH, STATUS_SHAPE, statusColorVar, type HabitatStatus } from './status-shapes';

export interface StatusMarkProps {
  status: HabitatStatus;
  /** Rendered size in pixels: 12 (dense strips), 16 (default, inline with text), 20 (legend, inspector), 24 (dumbbell, selected site). */
  size?: 12 | 16 | 20 | 24;
  className?: string;
}

/**
 * One habitat-status mark: the status shape in its tone with an ink outline (DS-02). The mark is
 * decorative (`aria-hidden`); it always sits beside a text label or is described by an adjacent
 * accessible name. Colour and outline come from the direction tokens, so the mark follows the
 * active direction. The hollow unknown ring is a neutral fill with a 2.5 stroke in the unknown tone.
 */
export function StatusMark({ status, size = 16, className }: StatusMarkProps) {
  const isUnknown = status === 'unknown';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-status={status}
      data-shape={STATUS_SHAPE[status]}
    >
      <path
        d={STATUS_PATH[status]}
        fill={isUnknown ? 'var(--dir-mark-fill-unknown)' : statusColorVar(status)}
        stroke={isUnknown ? statusColorVar(status) : 'var(--dir-mark-outline)'}
        strokeWidth={isUnknown ? 2.5 : 'var(--mark-outline-w)'}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
