import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from '@/features/ui';

/**
 * useReducedMotion (04-07, DS-06): the one JS-side reduced-motion switch. It is true when the OS asks
 * for reduced motion (matchMedia) or when the surface root carries data-reduced-motion="true" (the
 * fixtures toggle), and it follows both as they change.
 */

type Listener = (event: { matches: boolean }) => void;

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => mql) });
  return {
    set(matches: boolean) {
      mql.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
    listenerCount: () => listeners.size,
  };
}

let surface: HTMLDivElement;

beforeEach(() => {
  surface = document.createElement('div');
  surface.setAttribute('data-surface', 'instrument');
  document.body.appendChild(surface);
});

afterEach(() => {
  surface.remove();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useReducedMotion', () => {
  it('is false by default', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('is true when the media query matches, and follows it', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('is true after data-reduced-motion="true" is set on the surface root, and false once it is removed', async () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => {
      surface.setAttribute('data-reduced-motion', 'true');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      surface.removeAttribute('data-reduced-motion');
    });
    expect(result.current).toBe(false);
  });

  it('ignores any other attribute value', async () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {
      surface.setAttribute('data-reduced-motion', 'false');
    });
    expect(result.current).toBe(false);
  });

  it('uses the nearest surface ancestor of the ref when one is given', async () => {
    stubMatchMedia(false);
    const other = document.createElement('div');
    other.setAttribute('data-surface', 'instrument');
    other.setAttribute('data-reduced-motion', 'true');
    document.body.appendChild(other);
    const inner = document.createElement('span');
    surface.appendChild(inner);

    const { result } = renderHook(() => useReducedMotion({ current: inner }));
    expect(result.current).toBe(false);

    await act(async () => {
      surface.setAttribute('data-reduced-motion', 'true');
    });
    expect(result.current).toBe(true);
    other.remove();
  });

  it('does not throw without matchMedia and unsubscribes on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);

    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
