/**
 * useProjection (04-19, DS-05): the projection artifact reaches the page only through the verified
 * contract client, exactly like useModelVersion. The expectations are read from the committed
 * contracts/bucket/v1/projection.json, so a regenerated artifact changes the test with it.
 */
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjection } from '@/features/contract';
import { installContractFetch, readContractJson, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useProjection', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;
  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    client = new QueryClient();
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  it('resolves to the parsed projection through the verified path', async () => {
    const expected = readContractJson('contracts/bucket/v1/projection.json') as {
      coordinates: unknown[];
      cumulative_explained_variance_ratio: number;
    };
    const { result } = renderHook(() => useProjection(), { wrapper: wrapperFor(client) });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.coordinates).toHaveLength(expected.coordinates.length);
    expect(result.current.data?.coordinates).toHaveLength(48);
    expect(result.current.data?.cumulative_explained_variance_ratio).toBe(0.32993314);
    expect(result.current.data?.explained_variance_ratio).toHaveLength(2);
    expect(result.current.verified).toBe(true);
    expect(result.current.version).toBe(1);
    expect(handle.requests).toContain('v1/projection.json');
    expect(handle.refused).toEqual([]);
  });

  it('keys the data by contract version', async () => {
    const { result } = renderHook(() => useProjection(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    expect(keys).toContain(JSON.stringify(['contract', 1, 'projection']));
  });

  it('a one-byte change to the served projection is an integrity error, never data', async () => {
    handle.mutate('v1/projection.json', (bytes) => {
      const copy = new Uint8Array(bytes);
      copy[copy.length - 2] = copy[copy.length - 2] ^ 1;
      return copy;
    });
    const { result } = renderHook(() => useProjection(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.name).toBe('ContractIntegrityError');
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
