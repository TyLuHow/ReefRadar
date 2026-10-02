import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { expectedManifestSha256, loadManifest } from '@/features/contract/client';
import { ContractIntegrityError } from '@/features/contract/errors';
import { useContract } from '@/features/contract/hooks';
import { PUBLISHED_MANIFEST_SHA256 } from '@/features/contract/published';
import { installContractFetch, readContractJson, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

/**
 * WR-02: a pinned or stamp-resolved manifest is checked against the hash the
 * bundle knows for that published version; a version newer than the build is
 * served but flagged unverified, and never shares a cache entry with verified data.
 */

describe('bundled published manifest hashes', () => {
  it('mirror contracts/PUBLISHED.json exactly', () => {
    const published = readContractJson('contracts/PUBLISHED.json') as Record<string, { manifest_sha256: string }>;
    const expected = Object.fromEntries(Object.entries(published).map(([version, entry]) => [version, entry.manifest_sha256]));
    expect(PUBLISHED_MANIFEST_SHA256).toEqual(expected);
  });
});

describe('pinned manifest verification (WR-02)', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    client = new QueryClient();
    resetContractStore();
    setContractPin();
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  it('a pinned published version is verified against the bundled hash', async () => {
    const { result } = renderHook(() => useContract(1), { wrapper });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(1));
    expect(result.current.verified).toBe(true);
    expect(client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey))).toContain(JSON.stringify(['contract', 1, 'manifest']));
  });

  it('a pinned published version whose served bytes were altered is rejected', async () => {
    handle.mutate('contract/v1.json', (bytes) => new TextDecoder().decode(bytes).replace('"countries": 7', '"countries": 8'));
    await expect(loadManifest(1, null)).rejects.toBeInstanceOf(ContractIntegrityError);
    const { result } = renderHook(() => useContract(1), { wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ContractIntegrityError));
    expect(result.current.data).toBeUndefined();
  });

  it('a version unknown to this build is served but marked unverified, under its own cache key', async () => {
    const { result } = renderHook(() => useContract(2), { wrapper });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(2));
    expect(result.current.verified).toBe(false);
    const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain(JSON.stringify(['contract', 2, 'manifest', 'unverified']));
    expect(keys).not.toContain(JSON.stringify(['contract', 2, 'manifest']));
  });

  it('a pointer hash that disagrees with the bundled hash for its version is an integrity error', () => {
    expect(() => expectedManifestSha256(1, 'a'.repeat(64))).toThrow(ContractIntegrityError);
    expect(expectedManifestSha256(1, PUBLISHED_MANIFEST_SHA256[1])).toBe(PUBLISHED_MANIFEST_SHA256[1]);
    expect(expectedManifestSha256(2, null)).toBeNull();
    expect(expectedManifestSha256(2, 'b'.repeat(64))).toBe('b'.repeat(64));
  });
});

