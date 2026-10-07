/**
 * ConditionalShell (C-WR-02): the legacy Navbar and Footer are hidden on /experience and on the dev-only
 * /dev routes, and only there. A route that merely starts with the letters "dev" keeps its shell.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/components/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

import { ConditionalShell } from '@/components/layout/ConditionalShell';

function shellShown() {
  render(
    <ConditionalShell>
      <p>page</p>
    </ConditionalShell>,
  );
  return screen.queryByTestId('navbar') !== null && screen.queryByTestId('footer') !== null;
}

describe('ConditionalShell', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it.each(['/', '/sites/', '/dashboard/analyze/', '/developers/', '/devices/', '/dev-tools/'])('keeps the shell on %s', (path) => {
    pathname = path;
    expect(shellShown()).toBe(true);
  });

  it.each(['/dev', '/dev/', '/dev/fixtures/', '/experience', '/experience/play/'])('hides the shell on %s', (path) => {
    pathname = path;
    expect(shellShown()).toBe(false);
  });
});
