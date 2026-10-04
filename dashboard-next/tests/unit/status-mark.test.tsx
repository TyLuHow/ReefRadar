import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HABITAT_STATUSES,
  STATUS_BG_CLASS,
  STATUS_FILL_CLASS,
  STATUS_LABELS,
  STATUS_PATH,
  STATUS_SHAPE,
  StatusMark,
  plotSymbol,
  statusColorVar,
  type HabitatStatus,
} from '@/features/ui';
import { SITE_STATUSES } from '@/features/contract/schema';

/** A recording path context: the calls Observable Plot's d3 path context would receive. */
function record(status: HabitatStatus, size: number): Array<[string, ...number[]]> {
  const calls: Array<[string, ...number[]]> = [];
  plotSymbol(status).draw(
    {
      moveTo: (x: number, y: number) => calls.push(['moveTo', x, y]),
      lineTo: (x: number, y: number) => calls.push(['lineTo', x, y]),
      arc: (x: number, y: number, r: number, a0: number, a1: number) => calls.push(['arc', x, y, r, a0, a1]),
      closePath: () => calls.push(['closePath']),
    },
    size,
  );
  return calls;
}

describe('status shapes', () => {
  it('lists the five statuses in ordinal order, warm to cool then unknown', () => {
    expect(HABITAT_STATUSES).toEqual(['degraded', 'restored_early', 'restored_mid', 'healthy', 'unknown']);
  });

  it('covers exactly the contract site statuses', () => {
    expect([...HABITAT_STATUSES].sort()).toEqual([...SITE_STATUSES].sort());
  });

  it('labels each status in words', () => {
    expect(STATUS_LABELS).toEqual({
      degraded: 'Degraded',
      restored_early: 'Restored (early)',
      restored_mid: 'Restored (mid)',
      healthy: 'Healthy',
      unknown: 'Unknown',
    });
  });

  it('assigns one distinct shape per status', () => {
    expect(STATUS_SHAPE).toEqual({
      degraded: 'down-triangle',
      restored_early: 'diamond',
      restored_mid: 'square',
      healthy: 'circle',
      unknown: 'ring',
    });
    expect(new Set(Object.values(STATUS_SHAPE)).size).toBe(5);
  });

  it('draws each shape in the 16-unit box', () => {
    expect(STATUS_PATH.degraded).toBe('M1 2L15 2L8 15Z');
    expect(STATUS_PATH.restored_early).toBe('M8 1L15 8L8 15L1 8Z');
    expect(STATUS_PATH.restored_mid).toBe('M2 2H14V14H2Z');
    expect(STATUS_PATH.healthy).toBe('M1 8A7 7 0 1 0 15 8A7 7 0 1 0 1 8Z');
    expect(STATUS_PATH.unknown).toBe('M2 8A6 6 0 1 0 14 8A6 6 0 1 0 2 8Z');
  });

  it('names the colour variable for each status with hyphens', () => {
    expect(statusColorVar('degraded')).toBe('var(--dir-hab-degraded)');
    expect(statusColorVar('restored_early')).toBe('var(--dir-hab-restored-early)');
    expect(statusColorVar('restored_mid')).toBe('var(--dir-hab-restored-mid)');
    expect(statusColorVar('healthy')).toBe('var(--dir-hab-healthy)');
    expect(statusColorVar('unknown')).toBe('var(--dir-hab-unknown)');
  });

  it('keeps Tailwind class names as literals the scanner can see', () => {
    expect(STATUS_FILL_CLASS.restored_early).toBe('fill-hab-restored-early');
    expect(STATUS_BG_CLASS.restored_mid).toBe('bg-hab-restored-mid');
    for (const status of HABITAT_STATUSES) {
      expect(STATUS_FILL_CLASS[status]).toMatch(/^fill-hab-[a-z-]+$/);
      expect(STATUS_BG_CLASS[status]).toMatch(/^bg-hab-[a-z-]+$/);
    }
  });
});

describe('StatusMark', () => {
  it.each(HABITAT_STATUSES)('renders an aria-hidden 16-unit svg for %s', (status) => {
    const { container } = render(<StatusMark status={status} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg?.getAttribute('data-status')).toBe(status);
    expect(svg?.getAttribute('data-shape')).toBe(STATUS_SHAPE[status]);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(STATUS_PATH[status]);
  });

  it('defaults to size 16 and accepts 12, 20 and 24', () => {
    const sizes = [undefined, 12, 16, 20, 24] as const;
    for (const size of sizes) {
      const { container, unmount } = render(<StatusMark status="healthy" size={size} />);
      const svg = container.querySelector('svg');
      const expected = String(size ?? 16);
      expect(svg?.getAttribute('width')).toBe(expected);
      expect(svg?.getAttribute('height')).toBe(expected);
      unmount();
    }
  });

  it.each(['degraded', 'restored_early', 'restored_mid', 'healthy'] as const)('fills %s with its tone and strokes the ink outline', (status) => {
    const { container } = render(<StatusMark status={status} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill')).toBe(statusColorVar(status));
    expect(path?.getAttribute('stroke')).toBe('var(--dir-mark-outline)');
    expect(path?.getAttribute('stroke-width')).toBe('var(--mark-outline-w)');
    expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('draws unknown as a hollow ring: neutral fill, 2.5 stroke in the unknown tone', () => {
    const { container } = render(<StatusMark status="unknown" />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('var(--dir-mark-fill-unknown)');
    expect(path?.getAttribute('stroke')).toBe('var(--dir-hab-unknown)');
    expect(path?.getAttribute('stroke-width')).toBe('2.5');
    expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('passes className through to the svg', () => {
    const { container } = render(<StatusMark status="degraded" className="shrink-0" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('shrink-0');
  });

  it('names no raw colour', () => {
    const { container } = render(<StatusMark status="healthy" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe('plotSymbol', () => {
  it('traces the down triangle from the 16-unit box centred on the origin at area 256 (scale 1)', () => {
    expect(record('degraded', 256)).toEqual([
      ['moveTo', -7, -6],
      ['lineTo', 7, -6],
      ['lineTo', 0, 7],
      ['closePath'],
    ]);
  });

  it('traces the diamond and the square', () => {
    expect(record('restored_early', 256)).toEqual([
      ['moveTo', 0, -7],
      ['lineTo', 7, 0],
      ['lineTo', 0, 7],
      ['lineTo', -7, 0],
      ['closePath'],
    ]);
    expect(record('restored_mid', 256)).toEqual([
      ['moveTo', -6, -6],
      ['lineTo', 6, -6],
      ['lineTo', 6, 6],
      ['lineTo', -6, 6],
      ['closePath'],
    ]);
  });

  it('traces the filled circle (r 7) and the ring (r 6) as full arcs', () => {
    expect(record('healthy', 256)).toEqual([['moveTo', 7, 0], ['arc', 0, 0, 7, 0, 2 * Math.PI], ['closePath']]);
    expect(record('unknown', 256)).toEqual([['moveTo', 6, 0], ['arc', 0, 0, 6, 0, 2 * Math.PI], ['closePath']]);
  });

  it('scales the geometry so the 16-unit box side is the square root of the requested area', () => {
    // area 64 -> box side 8 -> scale 0.5
    expect(record('degraded', 64)).toEqual([
      ['moveTo', -3.5, -3],
      ['lineTo', 3.5, -3],
      ['lineTo', 0, 3.5],
      ['closePath'],
    ]);
    expect(record('healthy', 64)).toEqual([['moveTo', 3.5, 0], ['arc', 0, 0, 3.5, 0, 2 * Math.PI], ['closePath']]);
  });
});
