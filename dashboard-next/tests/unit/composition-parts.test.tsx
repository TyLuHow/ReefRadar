/**
 * InstrumentHeader and AttributionFooter (04-21, DS-05): the two parts every composition shares.
 * The footer's text is the canonical citations module's own, and the header's contract chip is built
 * from props the caller computed, never from a typed number.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttributionFooter, InstrumentHeader } from '@/features/instrument';
import { formatCitation, getCitation } from '@/lib/citations';

describe('InstrumentHeader', () => {
  it('renders the wordmark, the five destinations and a computed contract chip', () => {
    render(<InstrumentHeader current="Explore" contractVersion={3} siteCount={12} />);
    expect(screen.getByText('ReefRadar')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Listen', 'Explore', 'Compare', 'Analyze', 'Methods']);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^#/);
    expect(screen.getByText('Contract v3 · 12 sites')).toBeTruthy();
  });

  it('marks only the current destination with aria-current and the accent underline', () => {
    render(<InstrumentHeader current="Compare" contractVersion={1} siteCount={2} />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const current = within(nav).getByRole('link', { name: 'Compare' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.className).toContain('text-accent');
    expect(current.className).toContain('underline');
    for (const name of ['Listen', 'Explore', 'Analyze', 'Methods']) {
      const other = within(nav).getByRole('link', { name });
      expect(other.hasAttribute('aria-current')).toBe(false);
      expect(other.className).not.toContain('text-accent');
    }
  });

  it('says "1 site" for one and loading text while the contract has not arrived', () => {
    const { rerender } = render(<InstrumentHeader current="Listen" contractVersion={1} siteCount={1} />);
    expect(screen.getByText('Contract v1 · 1 site')).toBeTruthy();
    rerender(<InstrumentHeader current="Listen" />);
    expect(screen.getByText('Contract loading')).toBeTruthy();
  });

  it('does not rely on a heading level of its own', () => {
    render(<InstrumentHeader current="Listen" contractVersion={1} siteCount={5} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('AttributionFooter', () => {
  it('prints "Audio: " then the canonical APA citation without its trailing URL, then the licence', () => {
    const { container } = render(<AttributionFooter />);
    const text = container.textContent ?? '';
    const apa = formatCitation('marrs', 'apa').replace(/\s*https:\/\/\S+$/, '');
    expect(text.startsWith(`Audio: ${apa}`)).toBe(true);
    expect(text).toContain(getCitation('marrs').licence);
    expect(text).not.toMatch(/https:\/\//);
  });

  it('links the DOI to doi.org and the licence to its own page', () => {
    render(<AttributionFooter />);
    const doi = getCitation('marrs').doi as string;
    const doiLink = screen.getByRole('link', { name: `doi.org/${doi}` });
    expect(doiLink.getAttribute('href')).toBe(`https://doi.org/${doi}`);
    const licence = screen.getByRole('link', { name: getCitation('marrs').licence });
    expect(licence.getAttribute('href')).toBe(getCitation('marrs').licence_url);
  });

  it('reads another dataset from the same module', () => {
    const { container } = render(<AttributionFooter citationId="coralsoundexplorer" />);
    expect(container.textContent).toContain(getCitation('coralsoundexplorer').licence);
  });

  it('throws for an unknown citation id rather than inventing one', () => {
    expect(() => render(<AttributionFooter citationId="nope" />)).toThrow(/Unknown citation id/);
  });
});
