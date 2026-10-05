/**
 * countBy and the Legend (04-17, DS-05, T-04-17-01). Counts are computed from the data shown and
 * asserted against the published contract: contracts/bucket/v1/sites.json (read from disk) has
 * 15 degraded, 6 restored early, 8 restored mid, 16 healthy and 9 unknown sites (54 in all).
 * Interactive rows are toggle buttons; React Aria updates on the next frame, so state is awaited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContractSite } from '@/features/contract';
import { Legend, type LegendEvidence } from '@/features/instrument';
import { HABITAT_STATUSES, countBy, type HabitatStatus } from '@/features/ui';

const SITES = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: ContractSite[];
  }
).sites;

const statusOf = (site: ContractSite): HabitatStatus => site.status;
const evidenceOf = (site: ContractSite): LegendEvidence => site.reference_role;
const countOf = (sites: readonly ContractSite[], status: HabitatStatus) => sites.filter((site) => site.status === status).length;

describe('countBy', () => {
  it('counts the published contract sites by status', () => {
    const counts = countBy(SITES, statusOf);
    expect(Object.fromEntries(counts)).toEqual({ degraded: 15, restored_early: 6, restored_mid: 8, healthy: 16, unknown: 9 });
    expect(SITES.length).toBe(54);
  });

  it('has a key for every status in ordinal order, zeros included', () => {
    const counts = countBy([], statusOf);
    expect(Array.from(counts.keys())).toEqual([...HABITAT_STATUSES]);
    expect(Array.from(counts.values())).toEqual([0, 0, 0, 0, 0]);
  });

  it('counts one item and accepts any accessor', () => {
    const counts = countBy([{ s: 'healthy' as HabitatStatus }], (item) => item.s);
    expect(counts.get('healthy')).toBe(1);
    expect(counts.get('degraded')).toBe(0);
  });
});

describe('Legend: static', () => {
  it('lists five rows in ordinal order with the contract counts and the total', () => {
    render(<Legend items={SITES} statusOf={statusOf} mode="static" />);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-legend-row]'));
    expect(rows.map((row) => row.getAttribute('data-legend-row'))).toEqual(['degraded', 'restored_early', 'restored_mid', 'healthy', 'unknown']);
    expect(rows.map((row) => row.textContent)).toEqual(['Degraded 15', 'Restored (early) 6', 'Restored (mid) 8', 'Healthy 16', 'Unknown 9']);
    expect(screen.getByText('Habitat status')).toBeInTheDocument();
    expect(screen.getByText(`${SITES.length} sites shown`)).toBeInTheDocument();
    expect(screen.getByText("No health status is assigned to these sites; see each site's status basis.")).toBeInTheDocument();
  });

  it('pairs every row with a status mark of its own shape', () => {
    render(<Legend items={SITES} statusOf={statusOf} mode="static" />);
    const shapes = Array.from(document.querySelectorAll('[data-legend-row] svg[data-shape]')).map((svg) => svg.getAttribute('data-shape'));
    expect(shapes).toEqual(['down-triangle', 'diamond', 'square', 'circle', 'ring']);
  });

  it('omits statuses with a zero count and the unknown explainer when no site is unknown', () => {
    const known = SITES.filter((site) => site.status === 'healthy' || site.status === 'degraded');
    render(<Legend items={known} statusOf={statusOf} mode="static" />);
    expect(Array.from(document.querySelectorAll('[data-legend-row]')).map((row) => row.getAttribute('data-legend-row'))).toEqual(['degraded', 'healthy']);
    expect(screen.queryByText(/No health status is assigned/)).toBeNull();
    expect(screen.getByText(`${known.length} sites shown`)).toBeInTheDocument();
  });

  it('computes the singular total', () => {
    render(<Legend items={SITES.slice(0, 1)} statusOf={statusOf} mode="static" />);
    expect(screen.getByText('1 site shown')).toBeInTheDocument();
  });

  it('computes every count from the data it is given, not from anything typed', () => {
    const subset = SITES.filter((site) => site.country === SITES[0].country);
    render(<Legend items={subset} statusOf={statusOf} mode="static" />);
    for (const status of HABITAT_STATUSES) {
      const row = document.querySelector(`[data-legend-row="${status}"]`);
      const expected = countOf(subset, status);
      if (expected === 0) expect(row).toBeNull();
      else expect(row?.querySelector('[data-count]')?.textContent).toBe(String(expected));
    }
  });

  it('lists the Evidence group computed from reference_role', () => {
    render(<Legend items={SITES} statusOf={statusOf} evidenceOf={evidenceOf} mode="static" />);
    const acoustic = SITES.filter((site) => site.reference_role === 'acoustic_reference').length;
    const location = SITES.filter((site) => site.reference_role === 'location_only').length;
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText(`Acoustic reference ${acoustic}`)).toBeInTheDocument();
    expect(screen.getByText(`Location only ${location}`)).toBeInTheDocument();
    expect(acoustic + location).toBe(SITES.length);
  });

  it('has no buttons', () => {
    render(<Legend items={SITES} statusOf={statusOf} mode="static" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Legend: interactive', () => {
  const country = SITES.find((site) => site.status === 'healthy')?.country ?? SITES[0].country;
  const inCountry = SITES.filter((site) => site.country === country);
  const zeroStatus = HABITAT_STATUSES.find((status) => countOf(SITES, status) > 0 && countOf(inCountry, status) === 0);

  it('shows one toggle per status in the full data with its filtered count, in a group with the filter label', () => {
    render(<Legend items={SITES} filtered={inCountry} statusOf={statusOf} mode="interactive" />);
    const group = screen.getByRole('toolbar', { name: 'Filter by habitat status' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    for (const status of HABITAT_STATUSES) {
      const button = group.querySelector(`[data-legend-row="${status}"]`) as HTMLElement;
      expect(button.querySelector('[data-count]')?.textContent).toBe(String(countOf(inCountry, status)));
    }
    expect(screen.getByText(`${inCountry.length} sites shown`)).toBeInTheDocument();
  });

  it('disables a zero-count row and still reads its zero', () => {
    expect(zeroStatus).toBeDefined();
    render(<Legend items={SITES} filtered={inCountry} statusOf={statusOf} mode="interactive" />);
    const row = document.querySelector(`[data-legend-row="${zeroStatus}"]`) as HTMLElement;
    expect(row).toBeDisabled();
    expect(row.textContent).toMatch(/ 0$/);
    const label = row.textContent?.replace(/ 0$/, '');
    expect(screen.getByRole('button', { name: `${label} 0` })).toBeDisabled();
  });

  it('keeps a selected zero-count row enabled so the filter can be undone', () => {
    render(<Legend items={SITES} filtered={inCountry} selected={zeroStatus ? [zeroStatus] : []} statusOf={statusOf} mode="interactive" />);
    const row = document.querySelector(`[data-legend-row="${zeroStatus}"]`) as HTMLElement;
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports a toggle once per press and marks the selected row with aria-pressed', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    function Controlled() {
      const [selected, setSelected] = useState<HabitatStatus[]>([]);
      return (
        <Legend
          items={SITES}
          statusOf={statusOf}
          mode="interactive"
          selected={selected}
          onToggle={(status) => {
            onToggle(status);
            setSelected((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));
          }}
        />
      );
    }
    render(<Controlled />);
    const healthy = screen.getByRole('button', { name: `Healthy ${countOf(SITES, 'healthy')}` });
    expect(healthy).toHaveAttribute('aria-pressed', 'false');
    await user.click(healthy);
    await waitFor(() => expect(healthy).toHaveAttribute('aria-pressed', 'true'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('healthy');
    await user.click(healthy);
    await waitFor(() => expect(healthy).toHaveAttribute('aria-pressed', 'false'));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('gives every row a 44 px minimum height', () => {
    render(<Legend items={SITES} statusOf={statusOf} mode="interactive" />);
    for (const row of Array.from(document.querySelectorAll('[data-legend-row]'))) expect(row.className).toContain('min-h-11');
  });

  it('prints the unknown explainer only while unknown sites are shown', () => {
    const { unmount } = render(<Legend items={SITES} filtered={inCountry} statusOf={statusOf} mode="interactive" />);
    expect(countOf(inCountry, 'unknown')).toBe(0);
    expect(screen.queryByText(/No health status is assigned/)).toBeNull();
    unmount();
    render(<Legend items={SITES} statusOf={statusOf} mode="interactive" />);
    expect(screen.getByText(/No health status is assigned/)).toBeInTheDocument();
  });

  it('counts the Evidence group under the current filter', () => {
    render(<Legend items={SITES} filtered={inCountry} statusOf={statusOf} evidenceOf={evidenceOf} mode="interactive" />);
    const acoustic = inCountry.filter((site) => site.reference_role === 'acoustic_reference').length;
    expect(screen.getByText(`Acoustic reference ${acoustic}`)).toBeInTheDocument();
  });
});

describe('Legend: states', () => {
  it('loading shows five skeleton rows and the label', () => {
    render(<Legend items={[]} statusOf={statusOf} mode="static" state="loading" />);
    const status = screen.getByRole('status');
    expect(within(status).getByText('Loading counts…')).toBeInTheDocument();
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });

  it('empty says there are no sites, also when the data is an empty list', () => {
    const { unmount } = render(<Legend items={[]} statusOf={statusOf} mode="static" state="empty" />);
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
    unmount();
    render(<Legend items={[]} statusOf={statusOf} mode="interactive" />);
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
