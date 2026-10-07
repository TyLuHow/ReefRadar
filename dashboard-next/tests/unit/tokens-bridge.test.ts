import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JS_TOKEN_KEYS, TokenError, findSurfaceRoot, readTokens, useTokens } from '@/features/ui';

/**
 * The token bridge (04-02): JavaScript consumers (map paint, canvas, chart scales) read resolved
 * custom properties, and only six-digit sRGB hex is accepted. jsdom does not process CSS, so the
 * computed style is an injected stub or inline custom properties.
 */

function styleStub(values: Record<string, string>) {
  return () => ({ getPropertyValue: (name: string) => values[name] ?? '' }) as unknown as CSSStyleDeclaration;
}

function completeValues(overrides: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string> = {};
  JS_TOKEN_KEYS.forEach((key, index) => {
    values[`--dir-${key}`] = `  #${(index + 1).toString(16).padStart(2, '0').repeat(3).toUpperCase()}  `;
  });
  return { ...values, ...overrides };
}

describe('readTokens', () => {
  it('returns every JS token, trimmed, keyed by the name without --dir-', () => {
    const root = document.createElement('div');
    const tokens = readTokens(root, styleStub(completeValues({ '--dir-ground': ' #FFFFFF ' })));
    expect(Object.keys(tokens).sort()).toEqual([...JS_TOKEN_KEYS].sort());
    expect(tokens.ground).toBe('#FFFFFF');
    for (const key of JS_TOKEN_KEYS) expect(tokens[key]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('throws a TokenError naming the key when a value is missing', () => {
    const values = completeValues();
    delete values['--dir-hab-healthy'];
    const root = document.createElement('div');
    let error: unknown;
    try {
      readTokens(root, styleStub(values));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TokenError);
    expect((error as TokenError).key).toBe('hab-healthy');
    expect((error as TokenError).message).toContain('hab-healthy');
  });

  it('expands the three-digit hex the production CSS minifier writes (#fff, #333, #000) to six digits', () => {
    const root = document.createElement('div');
    const tokens = readTokens(root, styleStub(completeValues({ '--dir-ground': '#fff', '--dir-ink': ' #AbC ', '--dir-rule': '#000' })));
    expect(tokens.ground).toBe('#ffffff');
    expect(tokens.ink).toBe('#AAbbCC');
    expect(tokens.rule).toBe('#000000');
  });

  it('throws on a value that is not a hex colour (oklch, rgb, four-digit hex, 8-digit hex)', () => {
    const root = document.createElement('div');
    for (const bad of ['oklch(60% 0.2 30)', 'rgb(1, 2, 3)', '#ffff', '#11223344']) {
      let error: unknown;
      try {
        readTokens(root, styleStub(completeValues({ '--dir-ink': bad })));
      } catch (caught) {
        error = caught;
      }
      expect(error, bad).toBeInstanceOf(TokenError);
      expect((error as TokenError).key).toBe('ink');
      expect((error as TokenError).value).toBe(bad);
    }
  });

  it('reads the custom properties set inline on a real element through the default getComputedStyle', () => {
    const root = document.createElement('div');
    for (const [name, value] of Object.entries(completeValues())) root.style.setProperty(name, value.trim());
    document.body.appendChild(root);
    try {
      const tokens = readTokens(root);
      expect(tokens.ground).toBe('#010101');
    } finally {
      root.remove();
    }
  });
});

describe('findSurfaceRoot', () => {
  it('returns the nearest instrument surface ancestor, or null', () => {
    const surface = document.createElement('div');
    surface.setAttribute('data-surface', 'instrument');
    const inner = document.createElement('span');
    surface.appendChild(inner);
    expect(findSurfaceRoot(inner)).toBe(surface);
    expect(findSurfaceRoot(surface)).toBe(surface);
    expect(findSurfaceRoot(document.createElement('div'))).toBeNull();
    expect(findSurfaceRoot(null)).toBeNull();
  });
});

describe('useTokens', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mountSurface() {
    const surface = document.createElement('div');
    surface.setAttribute('data-surface', 'instrument');
    surface.setAttribute('data-direction', 'atlas');
    for (const [name, value] of Object.entries(completeValues())) surface.style.setProperty(name, value.trim());
    document.body.appendChild(surface);
    return surface;
  }

  it('reads on mount and bumps version after data-direction or style changes on the surface root', async () => {
    const surface = mountSurface();
    const ref = { current: surface as Element | null };
    const { result, unmount } = renderHook(() => useTokens(ref));

    await waitFor(() => expect(result.current.tokens).not.toBeNull());
    expect(result.current.tokens?.ground).toBe('#010101');
    const first = result.current.version;

    await act(async () => {
      surface.setAttribute('data-direction', 'poster');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.version).toBeGreaterThan(first));
    const second = result.current.version;

    await act(async () => {
      surface.style.setProperty('--dir-ground', '#ABCDEF');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.version).toBeGreaterThan(second));
    expect(result.current.tokens?.ground).toBe('#ABCDEF');

    unmount();
  });

  it('observes the surface root when the ref points at a descendant', async () => {
    const surface = mountSurface();
    const inner = document.createElement('div');
    surface.appendChild(inner);
    const ref = { current: inner as Element | null };
    const { result, unmount } = renderHook(() => useTokens(ref));
    await waitFor(() => expect(result.current.tokens).not.toBeNull());
    const first = result.current.version;

    await act(async () => {
      surface.setAttribute('data-reduced-motion', 'true');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.version).toBeGreaterThan(first));
    unmount();
  });

  it('disconnects its MutationObserver on unmount', async () => {
    // Observe the observer, not the hook result: after unmount the hook never renders again, so a
    // leaked observer's setState would be a silent no-op and result.current would stay frozen.
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    try {
      const surface = mountSurface();
      const ref = { current: surface as Element | null };
      const { result, unmount } = renderHook(() => useTokens(ref));
      await waitFor(() => expect(result.current.tokens).not.toBeNull());
      disconnect.mockClear();
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      disconnect.mockRestore();
    }
  });

  it('returns null tokens when the ref is empty or outside an instrument surface', async () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const ref = { current: outside as Element | null };
    const { result } = renderHook(() => useTokens(ref));
    await Promise.resolve();
    expect(result.current.tokens).toBeNull();
    expect(result.current.version).toBe(0);
  });
});
