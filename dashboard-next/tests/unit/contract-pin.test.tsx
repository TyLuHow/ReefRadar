import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { parseContractVersionParam, useContractVersionStore } from '@/features/contract/version';
import { ContractVersionSync } from '@/features/contract/ContractVersionSync';
import { useContract, ContractNotFoundError, ContractVersionParamError } from '@/features/contract';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

// ContractVersionSync reads the URL through useSearchParams; the test supplies the query string.
let currentSearch = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

const latestRequests = (handle: ContractFetchHandle) => handle.requests.filter((p) => p === 'contract/latest.json');

describe('parseContractVersionParam', () => {
  it('treats an absent parameter as unpinned', () => {
    expect(parseContractVersionParam(null)).toEqual({ kind: 'unpinned' });
  });

  it.each([
    ['1', 1],
    ['9', 9],
    ['123456', 123456],
  ])('pins %s to the integer %d', (raw, version) => {
    expect(parseContractVersionParam(raw)).toEqual({ kind: 'pinned', version });
  });

  it.each(['', '0', '01', 'abc', '1.5', '-1', '+1', ' 1', '1 ', '../x', '1/../2', 'v1', '1234567', '١'])(
    'rejects %j as invalid (never coerced, never a path)',
    (raw) => {
      expect(parseContractVersionParam(raw)).toEqual({ kind: 'invalid', raw });
    }
  );
});

describe('contract hooks resolve the URL pin', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;
  beforeEach(() => {
    handle = installContractFetch({ latest: 2 });
    client = new QueryClient();
    resetContractStore();
    currentSearch = '';
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  it('makes no contract request before the store has resolved the URL', async () => {
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handle.requests).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('pinned 1 while latest is 2 returns manifest v1 and never requests latest.json', async () => {
    setContractPin({ kind: 'pinned', version: 1 });
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(1));
    expect(result.current.version).toBe(1);
    expect(handle.requests).toEqual(['contract/v1.json']);
    expect(latestRequests(handle)).toEqual([]);
  });

  it('pinned 1 while latest is also 1 still issues zero latest.json requests', async () => {
    handle.setLatest(1);
    setContractPin({ kind: 'pinned', version: 1 });
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(1));
    expect(latestRequests(handle)).toEqual([]);
  });

  it('pinned 9 (absent) is a ContractNotFoundError and does not fall back to latest', async () => {
    setContractPin({ kind: 'pinned', version: 9 });
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ContractNotFoundError));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(latestRequests(handle)).toEqual([]);
  });

  it('an invalid pin is a ContractVersionParamError with no contract request at all', async () => {
    setContractPin({ kind: 'invalid', raw: '../x' });
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ContractVersionParamError));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(handle.requests).toEqual([]);
  });

  it('an unpinned store follows latest.json', async () => {
    setContractPin({ kind: 'unpinned' });
    const { result } = renderHook(() => useContract(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(2));
    expect(handle.requests).toEqual(['contract/latest.json', 'contract/v2.json']);
  });

  it('an explicit version argument wins over the pin and over an unresolved store', async () => {
    setContractPin({ kind: 'pinned', version: 2 });
    const { result } = renderHook(() => useContract(1), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(1));
    expect(handle.requests).toEqual(['contract/v1.json']);

    resetContractStore();
    handle.requests.length = 0;
    const second = renderHook(() => useContract(1), { wrapper: wrapperFor(new QueryClient()) });
    await waitFor(() => expect(second.result.current.data?.contract_version).toBe(1));
  });
});

describe('ContractVersionSync', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;
  beforeEach(() => {
    handle = installContractFetch({ latest: 2 });
    client = new QueryClient();
    resetContractStore();
    delete document.documentElement.dataset.contractVersion;
    delete document.documentElement.dataset.contractPinned;
    delete document.documentElement.dataset.contractCoverage;
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  const mount = () => render(createElement(QueryClientProvider, { client }, createElement(ContractVersionSync)));

  it('?cv=1 while latest is 2: marks the document pinned to v1 and makes no latest.json request', async () => {
    currentSearch = 'cv=1';
    mount();
    await waitFor(() => expect(document.documentElement.dataset.contractVersion).toBe('1'));
    expect(document.documentElement.dataset.contractPinned).toBe('true');
    expect(latestRequests(handle)).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useContractVersionStore.getState().resolved).toBe(true);
  });

  it('no cv: follows latest (v2) and is not pinned', async () => {
    currentSearch = '';
    mount();
    await waitFor(() => expect(document.documentElement.dataset.contractVersion).toBe('2'));
    expect(document.documentElement.dataset.contractPinned).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('?cv=9 shows a visible not-found alert naming the version and never asks for latest', async () => {
    currentSearch = 'cv=9';
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('contract version 9 was not found');
    expect(latestRequests(handle)).toEqual([]);
    expect(document.documentElement.dataset.contractVersion).toBeUndefined();
  });

  it.each(['abc', '', '0', '../x', '1.5'])('?cv=%j shows a visible invalid alert and makes no contract request', async (raw) => {
    currentSearch = `cv=${encodeURIComponent(raw)}`;
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('not a valid contract version');
    expect(handle.requests).toEqual([]);
  });

  it('bounds how much of a hostile value is echoed into the alert', async () => {
    currentSearch = `cv=${'a'.repeat(500)}`;
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent!.length).toBeLessThan(300);
  });
});
