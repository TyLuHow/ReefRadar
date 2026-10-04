import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIXTURE_SLUGS, isFixtureSlug } from '@/features/fixtures/slugs';
import { FIXTURE_SECTIONS } from '@/features/fixtures/registry';
import { StateCell } from '@/features/fixtures/parts/StateCell';
import { FixtureSection } from '@/features/fixtures/parts/FixtureSection';

/** UI-SPEC "Section order"; later plans append in this order, so the registry is always a subsequence. */
const FINAL_ORDER = [
  'tokens',
  'status-palette',
  'spectrogram-scale',
  'button',
  'dialog',
  'sheet',
  'listbox',
  'table',
  'slider',
  'toggle-group',
  'tooltip',
  'command-palette',
  'transport',
  'spectrogram',
  'window-strip',
  'band-toggle',
  'compare',
  'provenance',
  'strip-plot',
  'probability-bar',
  'data-table',
  'legend',
  'status-band',
  'clip-card',
  'states',
  'numerals',
  'motion',
  'composition-inspector',
  'composition-listen',
  'composition-compare',
  'composition-explore',
  'token-probe',
];

describe('fixture slugs and registry', () => {
  it('FIXTURE_SLUGS equals the registry slugs, in order', () => {
    expect([...FIXTURE_SLUGS]).toEqual(FIXTURE_SECTIONS.map((section) => section.slug));
  });

  it('every slug is a lower-case url segment and unique', () => {
    for (const slug of FIXTURE_SLUGS) expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(FIXTURE_SLUGS).size).toBe(FIXTURE_SLUGS.length);
  });

  it('follows the UI-SPEC section order', () => {
    const positions = FIXTURE_SLUGS.map((slug) => FINAL_ORDER.indexOf(slug));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('registers the two Foundation sections first, each with its own component', () => {
    expect(FIXTURE_SECTIONS.slice(0, 2).map((section) => [section.slug, section.group])).toEqual([
      ['tokens', 'Foundation'],
      ['status-palette', 'Foundation'],
    ]);
    for (const section of FIXTURE_SECTIONS) expect(typeof section.Component).toBe('function');
  });

  it('isFixtureSlug accepts registered slugs only', () => {
    for (const slug of FIXTURE_SLUGS) expect(isFixtureSlug(slug)).toBe(true);
    expect(isFixtureSlug('not-a-section')).toBe(false);
    expect(isFixtureSlug('')).toBe(false);
    expect(isFixtureSlug('__proto__')).toBe(false);
    expect(isFixtureSlug('constructor')).toBe(false);
  });
});

describe('StateCell', () => {
  it('carries the primitive, state and screen markers', () => {
    const { container } = render(createElement(StateCell, { primitive: 'button', state: 'default' }, 'content'));
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.getAttribute('data-fixture-primitive')).toBe('button');
    expect(cell.getAttribute('data-fixture-state')).toBe('default');
    expect(cell.hasAttribute('data-screen')).toBe(true);
    expect(screen.getByText('DEFAULT')).toBeTruthy();
    expect(screen.queryByText('State forced for review')).toBeNull();
  });

  it('writes a forced hover cell as "(forced)" and says so', () => {
    render(createElement(StateCell, { primitive: 'button', state: 'hover', forced: true }, 'content'));
    expect(screen.getByText('HOVER (forced)')).toBeTruthy();
    expect(screen.getByText('State forced for review')).toBeTruthy();
  });

  it('adds "(forced)" to focus and pressed too, and spaces multi-word states', () => {
    render(
      createElement(
        'div',
        null,
        createElement(StateCell, { primitive: 'button', state: 'focus', forced: true }, 'a'),
        createElement(StateCell, { primitive: 'button', state: 'pressed', forced: true }, 'b'),
        createElement(StateCell, { primitive: 'slider', state: 'one-value' }, 'c'),
      ),
    );
    expect(screen.getByText('FOCUS (forced)')).toBeTruthy();
    expect(screen.getByText('PRESSED (forced)')).toBeTruthy();
    expect(screen.getByText('ONE VALUE')).toBeTruthy();
  });

  it('does not add "(forced)" to a forced state that is not hover, focus or pressed, but still says it was forced', () => {
    render(createElement(StateCell, { primitive: 'probability-bar', state: 'abstain', forced: true }, 'x'));
    expect(screen.getByText('ABSTAIN')).toBeTruthy();
    expect(screen.getByText('State forced for review')).toBeTruthy();
  });

  it('spans every column when asked', () => {
    const { container } = render(createElement(StateCell, { primitive: 'spectrogram', state: 'default', span: 'full' }, 'x'));
    expect((container.firstElementChild as HTMLElement).className).toContain('col-span-full');
  });
});

describe('FixtureSection anatomy', () => {
  it('renders eyebrow, h2, contract line, Data line and a grid, labelled by its heading', () => {
    const { container } = render(
      createElement(
        FixtureSection,
        {
          slug: 'tokens',
          group: 'Foundation',
          kind: 'Tokens',
          title: 'Tokens',
          contract: 'One sentence of contract.',
          data: 'tokens.css',
        },
        createElement('p', null, 'cell'),
      ),
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.id).toBe('tokens');
    const heading = section.querySelector('h2') as HTMLElement;
    expect(heading.textContent).toBe('Tokens');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(screen.getByText('Foundation · Tokens')).toBeTruthy();
    expect(screen.getByText('One sentence of contract.')).toBeTruthy();
    expect(screen.getByText('Data: tokens.css')).toBeTruthy();
  });
});
