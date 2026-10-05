/**
 * StatusBand (04-17, DS-05, T-04-17-01). Segments are sized by the count of the data shown
 * (flex-grow equals the count), counts come from countBy and are asserted against the published
 * contract sites (contracts/bucket/v1/sites.json: 15, 6, 8, 16, 9). Zero counts are omitted. With
 * onSelect each segment is a toggle button; React Aria updates on the next frame, so state is awaited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContractSite } from '@/features/contract';
import { StatusBand } from '@/features/instrument';
import { HABITAT_STATUSES, type HabitatStatus } from '@/features/ui';

const SITES = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: ContractSite[];
  }
).sites;

const statusOf = (site: ContractSite): HabitatStatus => site.status;
const countOf = (sites: readonly ContractSite[], status: HabitatStatus) => sites.filter((site) => site.status === status).length;

describe('StatusBand: static', () => {
  it('renders one segment per status present, sized by its count, in ordinal order', () => {
    render(<StatusBand items={SITES} statusOf={statusOf} />);
    const band = screen.getByRole('group', { name: 'Sites by habitat status' });
    const segments = Array.from(band.querySelectorAll<HTMLElement>('[data-segment]'));
    expect(segments.map((segment) => segment.getAttribute('data-segment'))).toEqual([...HABITAT_STATUSES]);
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['15', '6', '8', '16', '9']);
    expect(segments.map((segment) => segment.getAttribute('aria-label'))).toEqual([
      'Degraded: 15 sites',
      'Restored (early): 6 sites',
      'Restored (mid): 8 sites',
      'Healthy: 16 sites',
      'Unknown: 9 sites',
    ]);
  });

  it('draws every segment with a minimum width and a habitat-status fill', () => {
    render(<StatusBand items={SITES} statusOf={statusOf} />);
    for (const segment of Array.from(document.querySelectorAll<HTMLElement>('[data-segment]'))) {
      expect(segment.style.minWidth).toBe('4px');
      expect(segment.className).toMatch(/bg-hab-/);
    }
  });

  it('puts a mark, the count and the label under every segment, from the same counts', () => {
    render(<StatusBand items={SITES} statusOf={statusOf} />);
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[data-band-label]'));
    expect(labels.map((label) => label.textContent)).toEqual(['15Degraded', '6Restored (early)', '8Restored (mid)', '16Healthy', '9Unknown']);
    expect(labels.map((label) => label.querySelector('svg')?.getAttribute('data-shape'))).toEqual(['down-triangle', 'diamond', 'square', 'circle', 'ring']);
  });

  it('omits zero counts and computes the singular label', () => {
    const one = SITES.filter((site) => site.status === 'healthy').slice(0, 1);
    const two = SITES.filter((site) => site.status === 'degraded').slice(0, 2);
    render(<StatusBand items={[...one, ...two]} statusOf={statusOf} />);
    const segments = Array.from(document.querySelectorAll<HTMLElement>('[data-segment]'));
    expect(segments.map((segment) => segment.getAttribute('data-segment'))).toEqual(['degraded', 'healthy']);
    expect(segments.map((segment) => segment.getAttribute('aria-label'))).toEqual(['Degraded: 2 sites', 'Healthy: 1 site']);
  });

  it('computes every segment from the data it is given', () => {
    const subset = SITES.filter((site) => site.country === SITES[SITES.length - 1].country);
    render(<StatusBand items={subset} statusOf={statusOf} />);
    for (const status of HABITAT_STATUSES) {
      const segment = document.querySelector<HTMLElement>(`[data-segment="${status}"]`);
      const expected = countOf(subset, status);
      if (expected === 0) expect(segment).toBeNull();
      else expect(segment?.style.flexGrow).toBe(String(expected));
    }
  });

  it('has no buttons', () => {
    render(<StatusBand items={SITES} statusOf={statusOf} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('StatusBand: interactive', () => {
  it('makes each segment a toggle button named with its count, in a group with the band name', () => {
    render(<StatusBand items={SITES} statusOf={statusOf} onSelect={() => undefined} selected={['healthy']} />);
    const group = screen.getByRole('toolbar', { name: 'Sites by habitat status' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Degraded: 15 sites',
      'Restored (early): 6 sites',
      'Restored (mid): 8 sites',
      'Healthy: 16 sites',
      'Unknown: 9 sites',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
  });

  it('reports the pressed segment once', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StatusBand items={SITES} statusOf={statusOf} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Restored (early): 6 sites' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith('restored_early');
  });

  it('is reachable and operable from the keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StatusBand items={SITES} statusOf={statusOf} onSelect={onSelect} />);
    await user.tab();
    const first = screen.getByRole('button', { name: 'Degraded: 15 sites' });
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('degraded'));
  });
});

describe('StatusBand: states', () => {
  it('loading shows one track bar and five label skeletons with the label', () => {
    render(<StatusBand items={[]} statusOf={statusOf} state="loading" />);
    const status = screen.getByRole('status');
    expect(within(status).getByText('Loading counts…')).toBeInTheDocument();
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(6);
  });

  it('empty says there are no sites, also when the data is an empty list', () => {
    const { unmount } = render(<StatusBand items={[]} statusOf={statusOf} state="empty" />);
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
    unmount();
    render(<StatusBand items={[]} statusOf={statusOf} />);
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Sites by habitat status' })).toBeNull();
  });
});
