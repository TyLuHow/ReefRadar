import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { useCoverage } from '@/features/contract';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

/**
 * 02-08 (CONTRACT-03): a flipped latest.json is picked up by the same mounted
 * component, in the same QueryClient, within one 60 s refetch, with no remount.
 * The committed v2 fixture flips has_diel and reuses v1's sites bytes.
 */

interface Observation {
  version: number | undefined;
  hasDiel: boolean | undefined;
  isLoading: boolean;
}

describe('latest.json flip without a reload', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    handle = installContractFetch({ latest: 1 });
    client = new QueryClient();
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
    vi.useRealTimers();
  });

  it('shows has_diel false on v1, then true on v2 after the 60 s pointer refetch, in one mounted tree', async () => {
    const observed: Observation[] = [];
    let mounts = 0;
    const seenClients = new Set<QueryClient>();

    function Probe() {
      const coverage = useCoverage();
      const seenClient = useQueryClient();
      useEffect(() => {
        mounts += 1;
      }, []);
      seenClients.add(seenClient);
      observed.push({ version: coverage.version, hasDiel: coverage.data?.has_diel, isLoading: coverage.isLoading });
      return createElement('output', { 'data-diel': String(coverage.data?.has_diel), 'data-version': String(coverage.version) });
    }

    const view = render(createElement(QueryClientProvider, { client }, createElement(Probe)));
    await waitFor(() => expect(view.container.querySelector('output')?.getAttribute('data-diel')).toBe('false'));
    expect(view.container.querySelector('output')?.getAttribute('data-version')).toBe('1');

    handle.setLatest(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(view.container.querySelector('output')?.getAttribute('data-diel')).toBe('true'));
    expect(view.container.querySelector('output')?.getAttribute('data-version')).toBe('2');

    expect(handle.requests.filter((p) => p === 'contract/latest.json').length).toBeGreaterThanOrEqual(2);
    expect(handle.requests).toContain('contract/v2.json');
    expect(mounts, 'the probe must not have been remounted').toBe(1);
    expect(seenClients.size, 'one QueryClient throughout').toBe(1);

    // After the first data arrived the probe was never "loading" again: the flip did not blank the view.
    const firstData = observed.findIndex((o) => o.hasDiel !== undefined);
    expect(observed.slice(firstData).some((o) => o.isLoading || o.hasDiel === undefined)).toBe(false);
  });

  it('a pinned page ignores the flip entirely', async () => {
    setContractPin({ kind: 'pinned', version: 1 });
    function Probe(): ReactNode {
      const coverage = useCoverage();
      return createElement('output', { 'data-diel': String(coverage.data?.has_diel) });
    }
    const view = render(createElement(QueryClientProvider, { client }, createElement(Probe)));
    await waitFor(() => expect(view.container.querySelector('output')?.getAttribute('data-diel')).toBe('false'));

    handle.setLatest(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(view.container.querySelector('output')?.getAttribute('data-diel')).toBe('false');
    expect(handle.requests.filter((p) => p === 'contract/latest.json')).toEqual([]);
  });
});
