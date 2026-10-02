import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the barrel the pages import from; the reporter itself is covered by monitoring-report.test.ts.
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock('@/features/monitoring', () => ({ reportClientError }));

import RouteError from '@/app/error';
import GlobalError from '@/app/global-error';

// All strings are fake.
const SECRET_MESSAGE = 'secret https://x.example/a?token=1';

function makeError(digest?: string): Error & { digest?: string } {
  const error = new Error(SECRET_MESSAGE) as Error & { digest?: string };
  error.stack = `Error: ${SECRET_MESSAGE}\n    at Page (https://x.example/_next/page.js:1:1)`;
  if (digest !== undefined) error.digest = digest;
  return error;
}

beforeEach(() => {
  reportClientError.mockClear();
});

describe('app/error.tsx (route-level)', () => {
  it('shows the specified copy, focuses the h1, offers recovery and never shows the message', () => {
    const error = makeError('abc123');
    const retry = vi.fn();
    const reset = vi.fn();
    const { container } = render(<RouteError error={error} retry={retry} reset={reset} />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Something went wrong' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);

    expect(
      screen.getByText('This page could not be displayed. Try again, or go back to the home page.')
    ).toBeInTheDocument();
    expect(screen.getByText('Error reference: abc123')).toBeInTheDocument();

    // T-03-13-01: neither the message, the URL nor the stack is rendered.
    const text = container.textContent ?? '';
    expect(text).not.toContain('secret');
    expect(text).not.toContain('x.example');
    expect(text).not.toContain('token=1');
    expect(text).not.toContain('at Page');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();

    const home = screen.getByRole('link', { name: 'Back to home' });
    expect(home).toHaveAttribute('href', '/');
  });

  it('reports once with the error and the digest', () => {
    const error = makeError('abc123');
    const { rerender } = render(<RouteError error={error} retry={vi.fn()} reset={vi.fn()} />);
    rerender(<RouteError error={error} retry={vi.fn()} reset={vi.fn()} />);
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(error, { source: 'error-boundary', digest: 'abc123' });
  });

  it('omits the reference line when there is no digest', () => {
    render(<RouteError error={makeError()} retry={vi.fn()} reset={vi.fn()} />);
    expect(screen.queryByText(/Error reference/)).not.toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), { source: 'error-boundary', digest: null });
  });

  it('wraps a very long digest inside a panel that cannot exceed the viewport', () => {
    const digest = 'd'.repeat(300);
    const { container } = render(<RouteError error={makeError(digest)} retry={vi.fn()} reset={vi.fn()} />);
    const reference = screen.getByText(`Error reference: ${digest}`);
    expect(reference).toHaveStyle({ overflowWrap: 'anywhere' });

    const panel = container.querySelector('.glass-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel).toHaveStyle({ maxWidth: '560px', width: '100%' });
    // Selectable: the reference must not disable text selection.
    expect(reference.style.userSelect).not.toBe('none');
  });

  it('adds no motion', () => {
    const { container } = render(<RouteError error={makeError('abc')} retry={vi.fn()} reset={vi.fn()} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/animate-|transition|animation/);
  });
});

describe('app/global-error.tsx (root layout failure)', () => {
  it('is its own html document with inline styles only and the root-failure copy', () => {
    const markup = renderToStaticMarkup(<GlobalError error={makeError('abc123')} retry={() => {}} reset={() => {}} />);
    expect(markup).toContain('<html lang="en"');
    expect(markup).toContain('<body');
    expect(markup).toContain('Something went wrong');
    expect(markup).toContain('ReefRadar could not load. Reload the page, or try again in a few minutes.');
    expect(markup).toContain('Error reference: abc123');
    expect(markup).toContain('Reload page');
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('class=');
    expect(markup).not.toContain('secret');
    expect(markup).not.toContain('x.example');
    // Static values from the UI-SPEC.
    expect(markup).toContain('#1a1714');
    expect(markup).toContain('rgba(255,255,255,0.05)');
  });

  describe('behaviour', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      // React warns about rendering html/body inside the test container div.
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('focuses the h1, reports once as global-error and reloads on click', () => {
      const reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      const error = makeError('abc123');
      render(<GlobalError error={error} retry={() => {}} reset={() => {}} />);

      const heading = screen.getByRole('heading', { level: 1, name: 'Something went wrong' });
      expect(document.activeElement).toBe(heading);
      expect(reportClientError).toHaveBeenCalledTimes(1);
      expect(reportClientError).toHaveBeenCalledWith(error, { source: 'global-error', digest: 'abc123' });

      fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('has no link away (the document is broken) and omits the reference without a digest', () => {
      render(<GlobalError error={makeError()} retry={() => {}} reset={() => {}} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText(/Error reference/)).not.toBeInTheDocument();
    });
  });
});
