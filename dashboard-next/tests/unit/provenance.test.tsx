/**
 * ProvenanceChip, WhyPanel and the safe URL helper (04-12, DS-05). The data is the contract's own
 * sites file (contracts/bucket/v1/sites.json), read from disk: the panel shows who assigned a label,
 * what it means, the dataset, DOI, licence and the contract stamp, and a field with no value says
 * "Not recorded" with the stored reason, never a dropped row (UI-SPEC "ProvenanceChip and Why panel").
 *
 * Every link passes safeHttpsUrl (T-04-12-01): a javascript:, http: or relative value renders as
 * text, not as a link. Overlay tests wait for the expected focus or state before the next key, because
 * React Aria restores focus on the next frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractSite } from '@/features/contract';
import {
  ProvenanceChip,
  WhyPanelSurface,
  doiUrl,
  provenanceChipText,
  safeHttpsUrl,
  whyPanelDataFromSite,
  type WhyPanelData,
} from '@/features/instrument';

const SITES = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: ContractSite[];
  }
).sites;

const STAMP = { datasetVersion: 'dataset-v1', modelVersion: 'interim-real-only' };
const RECORDED = '2022-08-30T12:00:00';

const siteById = (id: string): ContractSite => {
  const site = SITES.find((candidate) => candidate.site_id === id);
  if (!site) throw new Error(`no contract site ${id}`);
  return site;
};

const IND_H1 = siteById('ind_H1');
const NULL_DOI = SITES.find((site) => site.doi === null) as ContractSite;
/** The contract requires a site with no label definition to be unknown and to state why. */
const UNKNOWN = SITES.find((site) => site.label_definition === null) as ContractSite;
const LONGEST = SITES.reduce((best, site) => ((site.label_definition?.length ?? 0) > (best.label_definition?.length ?? 0) ? site : best), SITES[0]);

const indData = whyPanelDataFromSite(IND_H1, { ...STAMP, recordedAt: RECORDED });

describe('safeHttpsUrl and doiUrl', () => {
  it('returns the URL for an https URL', () => {
    expect(safeHttpsUrl('https://creativecommons.org/licenses/by/4.0/')).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(safeHttpsUrl('https://doi.org/10.5522/04/29958062')).toBe('https://doi.org/10.5522/04/29958062');
  });

  it('refuses http, javascript:, data:, file:, protocol-relative, relative, empty and absent values', () => {
    for (const bad of [
      'http://example.org/a',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      '//example.org/a',
      '/about/',
      'about',
      '',
      '   ',
      'https:',
    ]) {
      expect(safeHttpsUrl(bad), bad).toBeUndefined();
    }
    expect(safeHttpsUrl(null)).toBeUndefined();
    expect(safeHttpsUrl(undefined)).toBeUndefined();
  });

  it('builds a DOI link on doi.org', () => {
    expect(doiUrl('10.5522/04/29958062')).toBe('https://doi.org/10.5522/04/29958062');
  });

  it('encodes characters that are not safe in a path, keeping the slashes', () => {
    expect(doiUrl('10.1000/a b?c#d')).toBe('https://doi.org/10.1000/a%20b%3Fc%23d');
    expect(safeHttpsUrl(doiUrl('10.1000/javascript:alert(1)'))).toBeDefined();
  });
});

describe('provenanceChipText', () => {
  it('reads from the data for each kind', () => {
    expect(provenanceChipText('source', indData)).toBe('MARRS · CC BY 4.0');
    expect(provenanceChipText('label', indData)).toBe(`Assigned by ${IND_H1.label_assigned_by}`);
    expect(provenanceChipText('model', indData)).toBe('Model interim-real-only');
    expect(provenanceChipText('missing', {})).toBe('Source not recorded');
  });

  it('falls back to "Source not recorded" when the data a kind needs is absent', () => {
    expect(provenanceChipText('source', {})).toBe('Source not recorded');
    expect(provenanceChipText('label', {})).toBe('Source not recorded');
    expect(provenanceChipText('model', {})).toBe('Source not recorded');
  });
});

describe('whyPanelDataFromSite', () => {
  it('carries the contract fields and the stamp, and invents nothing', () => {
    expect(indData).toMatchObject({
      siteId: 'ind_H1',
      assignedBy: IND_H1.label_assigned_by,
      definition: IND_H1.label_definition,
      datasetName: 'MARRS',
      datasetUrl: IND_H1.dataset_url,
      doi: IND_H1.doi,
      licence: 'CC BY 4.0',
      licenceUrl: IND_H1.licence_url,
      datasetVersion: 'dataset-v1',
      modelVersion: 'interim-real-only',
      recordedAt: RECORDED,
      status: 'healthy',
    });
    const bare = whyPanelDataFromSite(IND_H1, {});
    expect(bare.datasetVersion).toBeNull();
    expect(bare.modelVersion).toBeNull();
    expect(bare.recordedAt).toBeNull();
  });
});

function Chip(props: Partial<React.ComponentProps<typeof ProvenanceChip>>) {
  return (
    <>
      <button type="button">before</button>
      <ProvenanceChip kind="label" panel={indData} {...props} />
    </>
  );
}

const chipButton = (name: RegExp | string) => screen.getByRole('button', { name });
const terms = (root: HTMLElement) => Array.from(root.querySelectorAll('dt')).map((dt) => dt.textContent);
const valueOf = (root: HTMLElement, term: string): HTMLElement => {
  const dt = Array.from(root.querySelectorAll('dt')).find((node) => node.textContent === term);
  if (!dt) throw new Error(`no term ${term}`);
  return dt.nextElementSibling as HTMLElement;
};

describe('ProvenanceChip: the chip', () => {
  it('reads the text of its kind', () => {
    render(
      <>
        <ProvenanceChip kind="source" panel={indData} />
        <ProvenanceChip kind="label" panel={indData} />
        <ProvenanceChip kind="model" panel={indData} />
        <ProvenanceChip kind="missing" panel={{}} />
      </>,
    );
    expect(chipButton('MARRS · CC BY 4.0')).toBeInTheDocument();
    expect(chipButton(`Assigned by ${IND_H1.label_assigned_by}`)).toBeInTheDocument();
    expect(chipButton('Model interim-real-only')).toBeInTheDocument();
    expect(chipButton('Source not recorded')).toBeInTheDocument();
  });

  it('has aria-haspopup="dialog" and aria-expanded that is false until it opens', () => {
    render(<Chip />);
    const chip = chipButton(/Assigned by/);
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('draws a visual 28 px chip with a 44 px expanded hit area, in the data face', () => {
    render(<Chip />);
    const chip = chipButton(/Assigned by/);
    expect(chip).toHaveAttribute('data-hit-expanded');
    for (const cls of ['border', 'border-ink', 'bg-ground', 'font-data', 'text-eyebrow', 'px-2', 'py-1', 'hit-area']) {
      expect(chip.className.split(/\s+/), cls).toContain(cls);
    }
  });

  it('draws the missing kind with a dashed outline and an unknown ring, not a plain glyph', () => {
    render(<ProvenanceChip kind="missing" panel={{}} />);
    const chip = chipButton('Source not recorded');
    expect(chip.className).toContain('border-dashed');
    const ring = chip.querySelector('svg[data-status="unknown"]');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute('width')).toBe('12');
  });

  it('shows a skeleton and "Loading provenance…" in the loading state, with no button', () => {
    render(<ProvenanceChip kind="label" panel={{}} state="loading" />);
    expect(screen.getByText('Loading provenance…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ProvenanceChip: the Why panel', () => {
  it('opens on press with the title of its kind, and aria-expanded turns true', async () => {
    const user = userEvent.setup();
    render(<Chip />);
    await user.click(chipButton(/Assigned by/));
    await screen.findByRole('dialog', { name: 'Where this label comes from' });
    // The page behind a modal popover is hidden from assistive technology, so the chip is looked up with hidden: true.
    await waitFor(() => expect(screen.getByRole('button', { name: /Assigned by/, hidden: true })).toHaveAttribute('aria-expanded', 'true'));
  });

  it('titles each kind', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Chip kind="source" />);
    await user.click(chipButton(/MARRS/));
    expect(await screen.findByRole('dialog', { name: 'Source of this recording' })).toBeInTheDocument();
    unmount();
    render(<Chip kind="model" />);
    await user.click(chipButton(/Model/));
    expect(await screen.findByRole('dialog', { name: 'Where this reading comes from' })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the chip', async () => {
    const user = userEvent.setup();
    render(<Chip />);
    const chip = chipButton(/Assigned by/);
    await user.click(chip);
    await screen.findByRole('dialog');
    await waitFor(() => expect(chip).toHaveAttribute('aria-expanded', 'true'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the keyboard with Enter on the focused chip', async () => {
    const user = userEvent.setup();
    render(<Chip />);
    await user.tab();
    await user.tab();
    await waitFor(() => expect(document.activeElement).toBe(chipButton(/Assigned by/)));
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows who assigned the label, its definition in quotes, dataset, DOI, licence, versions and recorded time', async () => {
    const user = userEvent.setup();
    render(<Chip />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(terms(dialog)).toEqual(['Assigned by', 'Definition', 'Dataset', 'DOI', 'Licence', 'Dataset version', 'Model version', 'Recorded']);
    expect(valueOf(dialog, 'Assigned by')).toHaveTextContent(IND_H1.label_assigned_by);
    expect(valueOf(dialog, 'Definition')).toHaveTextContent(`“${IND_H1.label_definition}”`);
    expect(valueOf(dialog, 'Dataset version')).toHaveTextContent('dataset-v1');
    expect(valueOf(dialog, 'Model version')).toHaveTextContent('interim-real-only');
    expect(valueOf(dialog, 'Recorded')).toHaveTextContent('2022-08-30 12:00 (recorder clock), timezone unverified');
  });

  it('links the dataset, the DOI (on doi.org, in the data face) and the licence, https only', async () => {
    const user = userEvent.setup();
    render(<Chip />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    const dataset = within(valueOf(dialog, 'Dataset')).getByRole('link');
    expect(dataset).toHaveAttribute('href', IND_H1.dataset_url);
    expect(dataset).toHaveTextContent('MARRS');
    const doi = within(valueOf(dialog, 'DOI')).getByRole('link');
    expect(doi).toHaveAttribute('href', 'https://doi.org/10.5522/04/29958062');
    expect(doi.className).toContain('font-data');
    expect(doi).toHaveTextContent('10.5522/04/29958062');
    const licence = within(valueOf(dialog, 'Licence')).getByRole('link');
    expect(licence).toHaveAttribute('href', IND_H1.licence_url);
    for (const link of within(dialog).getAllByRole('link')) {
      const href = link.getAttribute('href') as string;
      expect(href.startsWith('https://') || href.startsWith('/')).toBe(true);
    }
  });

  it('shows "Not recorded" and the stored reason for a missing DOI, never a dropped row', async () => {
    const user = userEvent.setup();
    const data = whyPanelDataFromSite(NULL_DOI, STAMP);
    render(<Chip panel={data} />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(terms(dialog)).toContain('DOI');
    const doi = valueOf(dialog, 'DOI');
    expect(doi).toHaveTextContent('Not recorded');
    expect(doi).toHaveTextContent(NULL_DOI.doi_note as string);
    expect(within(doi).queryByRole('link')).toBeNull();
    // The recording time was not supplied: the row is there and says so.
    expect(valueOf(dialog, 'Recorded')).toHaveTextContent('Not recorded');
  });

  it('shows the status basis only when the status is unknown, and says why a definition is missing', async () => {
    const user = userEvent.setup();
    render(<Chip panel={whyPanelDataFromSite(UNKNOWN, STAMP)} />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(terms(dialog)).toContain('Status basis');
    expect(valueOf(dialog, 'Status basis')).toHaveTextContent(UNKNOWN.status_basis as string);
    expect(valueOf(dialog, 'Definition')).toHaveTextContent('Not recorded');
    expect(valueOf(dialog, 'Definition')).toHaveTextContent(UNKNOWN.status_basis as string);
  });

  it('shows every row as "Not recorded" for the missing kind, and states the missing source', async () => {
    const user = userEvent.setup();
    render(<Chip kind="missing" panel={{}} />);
    await user.click(chipButton('Source not recorded'));
    const dialog = await screen.findByRole('dialog');
    const rows = terms(dialog);
    expect(rows).toContain('DOI');
    expect(rows).not.toContain('Status basis');
    for (const term of rows as string[]) expect(valueOf(dialog, term)).toHaveTextContent('Not recorded');
    expect(within(dialog).queryAllByRole('link').map((l) => l.textContent)).toEqual(['Methods and limits']);
  });

  it('renders an unsafe URL as text and never as a link', async () => {
    const user = userEvent.setup();
    const hostile: WhyPanelData = {
      ...indData,
      datasetUrl: 'javascript:alert(1)',
      licenceUrl: 'http://example.org/licence',
    };
    render(<Chip panel={hostile} />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(within(valueOf(dialog, 'Dataset')).queryByRole('link')).toBeNull();
    expect(valueOf(dialog, 'Dataset')).toHaveTextContent('MARRS');
    expect(within(valueOf(dialog, 'Licence')).queryByRole('link')).toBeNull();
    expect(dialog.querySelector('a[href^="javascript"]')).toBeNull();
    expect(dialog.querySelector('a[href^="http:"]')).toBeNull();
  });

  it('links "Methods and limits" to the given destination', async () => {
    const user = userEvent.setup();
    render(<Chip methodsHref="/about/" />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Methods and limits' })).toHaveAttribute('href', '/about/');
  });

  it('drops a methods destination that is neither a path nor https', async () => {
    const user = userEvent.setup();
    render(<Chip methodsHref="javascript:alert(1)" />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: 'Methods and limits' })).toBeNull();
  });

  // The URL parser strips tab, CR and LF and reads a backslash as a slash, so each of these would
  // leave the site although the second character is not a slash (B WR-01).
  it.each([
    ['a tab after the slash', '/\t/evil.example'],
    ['a line feed after the slash', '/\n/evil.example'],
    ['a carriage return after the slash', '/\r/evil.example'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a protocol-relative URL', '//evil.example/about/'],
  ])('drops a methods path that resolves off-site: %s', async (_name, href) => {
    const user = userEvent.setup();
    render(<Chip methodsHref={href} />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: 'Methods and limits' })).toBeNull();
    expect(dialog.querySelector('a[href*="evil"]')).toBeNull();
  });

  it('keeps a same-site path with a query and a fragment', async () => {
    const user = userEvent.setup();
    render(<Chip methodsHref="/about/?tab=methods#limits" />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Methods and limits' })).toHaveAttribute(
      'href',
      '/about/?tab=methods#limits',
    );
  });
});

describe('ProvenanceChip: the panel on a phone', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('opens as a bottom sheet below 640 px', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      })),
    });
    const user = userEvent.setup();
    render(<Chip />);
    await user.click(chipButton(/Assigned by/));
    const dialog = await screen.findByRole('dialog', { name: 'Where this label comes from' });
    expect(dialog.parentElement?.className).toContain('max-h-[85dvh]');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(terms(dialog)).toContain('Assigned by');
  });
});

describe('WhyPanelSurface', () => {
  it('draws the panel in place: no dialog role, a heading, the site id broken after underscores, the frame', () => {
    const { container } = render(<WhyPanelSurface kind="label" panel={indData} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const surface = container.querySelector('[data-why-panel-surface]') as HTMLElement;
    for (const cls of ['bg-ground', 'border', 'border-ink', 'rule-top-heavy', 'p-5', 'max-w-[360px]']) {
      expect(surface.className.split(/\s+/), cls).toContain(cls);
    }
    expect(within(surface).getByRole('heading', { name: 'Where this label comes from' })).toBeInTheDocument();
    expect(surface.querySelector('[data-site-id]')?.innerHTML).toContain('ind_<wbr>H1');
  });

  it('wraps long values anywhere and never truncates a definition', () => {
    const data = whyPanelDataFromSite(LONGEST, STAMP);
    const { container } = render(<WhyPanelSurface kind="label" panel={data} />);
    const definition = valueOf(container, 'Definition');
    expect(definition.className).toContain('wrap-anywhere');
    expect(definition).toHaveTextContent(`“${LONGEST.label_definition}”`);
    expect(container.innerHTML).not.toMatch(/truncate|text-ellipsis|line-clamp/);
    // Site ids get a break opportunity after each underscore.
    const long = whyPanelDataFromSite(LONGEST, STAMP);
    const html = render(<WhyPanelSurface kind="label" panel={{ ...long, siteId: 'a_very_long_site_identifier_that_must_wrap' }} />).container.innerHTML;
    expect(html).toContain('a_<wbr>very_<wbr>long_<wbr>site_<wbr>identifier_<wbr>that_<wbr>must_<wbr>wrap');
  });

  it('shows skeleton rows and "Loading provenance…" in the loading state', () => {
    const { container } = render(<WhyPanelSurface kind="label" panel={{}} state="loading" />);
    expect(screen.getByText('Loading provenance…')).toBeInTheDocument();
    expect(container.querySelectorAll('dt')).toHaveLength(0);
  });

  it('shows the error state with the words and a link to Methods and limits', () => {
    render(<WhyPanelSurface kind="label" panel={{}} state="error" />);
    expect(screen.getByText('Provenance could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Try again, or open Methods and limits.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Methods and limits' })).toHaveAttribute('href', '/about/');
  });
});
