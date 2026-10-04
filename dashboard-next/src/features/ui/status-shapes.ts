/**
 * The one status geometry module (DS-02, 04-04). React marks (StatusMark), Observable Plot symbols
 * (plotSymbol) and later map icons all draw the five habitat-status shapes from the geometry below,
 * so a status looks the same on every surface. It holds geometry, not colour: colour comes only
 * from the --dir-hab-* tokens (statusColorVar or the Tailwind classes), which is why the
 * semantic-token scanner exempts this file from its raw-value rules.
 *
 * Shapes are drawn in a 16-unit box (UI-SPEC "Status shapes"):
 *   degraded       down triangle  (1,2) (15,2) (8,15)
 *   restored_early diamond        (8,1) (15,8) (8,15) (1,8)
 *   restored_mid   square         x 2, y 2, 12 by 12
 *   healthy        filled circle  centre (8,8), r 7
 *   unknown        hollow ring    centre (8,8), r 6 (the mark gives it a 2.5 stroke)
 * Order is ordinal, warm to cool, then the neutral unknown. A status colour is never shown without
 * its shape or a text label.
 */

export const HABITAT_STATUSES = ['degraded', 'restored_early', 'restored_mid', 'healthy', 'unknown'] as const;

export type HabitatStatus = (typeof HABITAT_STATUSES)[number];

export const STATUS_LABELS: Record<HabitatStatus, string> = {
  degraded: 'Degraded',
  restored_early: 'Restored (early)',
  restored_mid: 'Restored (mid)',
  healthy: 'Healthy',
  unknown: 'Unknown',
};

export type StatusShape = 'down-triangle' | 'diamond' | 'square' | 'circle' | 'ring';

export const STATUS_SHAPE: Record<HabitatStatus, StatusShape> = {
  degraded: 'down-triangle',
  restored_early: 'diamond',
  restored_mid: 'square',
  healthy: 'circle',
  unknown: 'ring',
};

/** Side of the reference box, and its centre. */
const BOX = 16;
const CENTRE = BOX / 2;

type Geometry = { kind: 'polygon'; points: ReadonlyArray<readonly [number, number]> } | { kind: 'circle'; r: number };

const GEOMETRY: Record<HabitatStatus, Geometry> = {
  degraded: {
    kind: 'polygon',
    points: [
      [1, 2],
      [15, 2],
      [8, 15],
    ],
  },
  restored_early: {
    kind: 'polygon',
    points: [
      [8, 1],
      [15, 8],
      [8, 15],
      [1, 8],
    ],
  },
  restored_mid: {
    kind: 'polygon',
    points: [
      [2, 2],
      [14, 2],
      [14, 14],
      [2, 14],
    ],
  },
  healthy: { kind: 'circle', r: 7 },
  unknown: { kind: 'circle', r: 6 },
};

function toPath(geometry: Geometry): string {
  if (geometry.kind === 'polygon') {
    const [first, ...rest] = geometry.points;
    return `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join('')}Z`;
  }
  const { r } = geometry;
  return `M${CENTRE - r} ${CENTRE}A${r} ${r} 0 1 0 ${CENTRE + r} ${CENTRE}A${r} ${r} 0 1 0 ${CENTRE - r} ${CENTRE}Z`;
}

/** SVG path data in the 16-unit box, one per status. */
export const STATUS_PATH: Record<HabitatStatus, string> = {
  degraded: toPath(GEOMETRY.degraded),
  restored_early: toPath(GEOMETRY.restored_early),
  restored_mid: toPath(GEOMETRY.restored_mid),
  healthy: toPath(GEOMETRY.healthy),
  unknown: toPath(GEOMETRY.unknown),
};

/** The CSS variable holding a status colour (`restored_early` becomes `--dir-hab-restored-early`). */
export function statusColorVar(status: HabitatStatus): string {
  return `var(--dir-hab-${status.replace(/_/g, '-')})`;
}

/** Literal class strings so Tailwind's scanner sees them; the colours come from @theme inline in tokens.css. */
export const STATUS_FILL_CLASS: Record<HabitatStatus, string> = {
  degraded: 'fill-hab-degraded',
  restored_early: 'fill-hab-restored-early',
  restored_mid: 'fill-hab-restored-mid',
  healthy: 'fill-hab-healthy',
  unknown: 'fill-hab-unknown',
};

export const STATUS_BG_CLASS: Record<HabitatStatus, string> = {
  degraded: 'bg-hab-degraded',
  restored_early: 'bg-hab-restored-early',
  restored_mid: 'bg-hab-restored-mid',
  healthy: 'bg-hab-healthy',
  unknown: 'bg-hab-unknown',
};

/** The subset of a path context a symbol draws with (d3-path, as Observable Plot passes it). */
export interface SymbolContext {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
}

/** An Observable Plot symbol object: `draw(context, size)` where `size` is the mark area in square pixels. */
export interface PlotStatusSymbol {
  draw(context: SymbolContext, size: number): void;
}

/**
 * The same geometry as a Plot symbol, centred on the origin. The 16-unit box side maps to the square
 * root of `size` (the d3 convention: `size` is an area), so a status mark and a Plot dot of equal area
 * have the same footprint.
 */
export function plotSymbol(status: HabitatStatus): PlotStatusSymbol {
  const geometry = GEOMETRY[status];
  return {
    draw(context, size) {
      const k = Math.sqrt(size) / BOX;
      if (geometry.kind === 'polygon') {
        geometry.points.forEach(([x, y], i) => {
          const px = (x - CENTRE) * k;
          const py = (y - CENTRE) * k;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        });
        context.closePath();
        return;
      }
      const r = geometry.r * k;
      context.moveTo(r, 0);
      context.arc(0, 0, r, 0, 2 * Math.PI);
      context.closePath();
    },
  };
}
