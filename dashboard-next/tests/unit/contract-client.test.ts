import { createElement, type ReactNode } from 'react';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { contractBaseUrl, DEFAULT_CONTRACT_BASE_URL, ContractConfigError } from '@/features/contract/config';
import {
  loadLatestPointer,
  loadManifest,
  loadContractSites,
  resolveArtifactUrl,
} from '@/features/contract/client';
import {
  ContractFetchError,
  ContractIntegrityError,
  ContractNotFoundError,
  ContractSchemaError,
  ContractUriError,
} from '@/features/contract/errors';
import { useLegacySitesResponse } from '@/features/contract/legacy';
import { useContract, useReferenceSites } from '@/features/contract/hooks';
import type { ContractManifest } from '@/features/contract/schema';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function loadV1(): Promise<ContractManifest> {
  const pointer = await loadLatestPointer();
  return loadManifest(pointer.contract_version, pointer.manifest_sha256);
}

describe('contract client', () => {
  let handle: ContractFetchHandle;
  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
  });
  afterEach(() => {
    handle.restore();
    vi.unstubAllEnvs();
  });

  it('resolves latest -> manifest -> sites and returns the 54 parsed sites', async () => {
    const pointer = await loadLatestPointer();
    expect(pointer.contract_version).toBe(1);
    const manifest = await loadManifest(pointer.contract_version, pointer.manifest_sha256);
    const sites = await loadContractSites(manifest);
    expect(sites).toHaveLength(54);
    expect(handle.requests).toEqual(['contract/latest.json', 'contract/v1.json', 'v1/sites.json']);
    expect(handle.refused).toEqual([]);
  });

  it('every fetch uses credentials "omit" and no custom request headers', async () => {
    await loadContractSites(await loadV1());
    expect(handle.inits.length).toBeGreaterThanOrEqual(3);
    for (const init of handle.inits) {
      expect(init?.credentials).toBe('omit');
      expect(init?.headers).toBeUndefined();
    }
  });

  it('a one-byte change to the served sites.json raises ContractIntegrityError', async () => {
    const manifest = await loadV1();
    handle.mutate('v1/sites.json', (bytes) => {
      const copy = new Uint8Array(bytes);
      copy[copy.length - 2] = copy[copy.length - 2] ^ 1;
      return copy;
    });
    const error = await loadContractSites(manifest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractIntegrityError);
    expect((error as ContractIntegrityError).path).toBe('v1/sites.json');
  });

  it('a tampered manifest fails against the pointer hash', async () => {
    const pointer = await loadLatestPointer();
    handle.mutate('contract/v1.json', (bytes) => new TextDecoder().decode(bytes).replace('"countries": 7', '"countries": 8'));
    await expect(loadManifest(1, pointer.manifest_sha256)).rejects.toBeInstanceOf(ContractIntegrityError);
  });

  it('403 raises ContractNotFoundError carrying the version and path', async () => {
    const error = await loadManifest(9, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractNotFoundError);
    expect((error as ContractNotFoundError).version).toBe(9);
    expect((error as ContractNotFoundError).path).toBe('contract/v9.json');
  });

  it('404 raises ContractNotFoundError too, and 500 raises ContractFetchError', async () => {
    const stub = vi.fn(async () => new Response('', { status: 404 }));
    globalThis.fetch = stub as unknown as typeof fetch;
    await expect(loadManifest(3, null)).rejects.toBeInstanceOf(ContractNotFoundError);
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
    const error = await loadManifest(3, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractFetchError);
    expect((error as ContractFetchError).status).toBe(503);
    expect(String((error as Error).message)).not.toContain('boom');
  });

  it('a network failure raises ContractFetchError', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(loadLatestPointer()).rejects.toBeInstanceOf(ContractFetchError);
  });

  it.each(['../x', '/v1/sites.json', 'https://example.com/v1/sites.json', 'v1/../v2/sites.json', 'v1\\sites.json'])(
    'artifact uri %s is rejected before any request',
    async (uri) => {
      const manifest = await loadV1();
      const before = handle.requests.length;
      const tampered = structuredClone(manifest);
      (tampered.artifacts.sites as { uri: string }).uri = uri;
      await expect(loadContractSites(tampered)).rejects.toBeInstanceOf(ContractUriError);
      expect(handle.requests.length).toBe(before);
    }
  );

  it('resolveArtifactUrl stays inside the base URL', () => {
    expect(resolveArtifactUrl(DEFAULT_CONTRACT_BASE_URL, 'v1/sites.json')).toBe(`${DEFAULT_CONTRACT_BASE_URL}v1/sites.json`);
    expect(() => resolveArtifactUrl(DEFAULT_CONTRACT_BASE_URL, '//evil.example/v1/x.json')).toThrow(ContractUriError);
    expect(() => resolveArtifactUrl(DEFAULT_CONTRACT_BASE_URL, 'other/v1.json')).toThrow(ContractUriError);
  });

  it('an invalid site (status "great") raises ContractSchemaError', async () => {
    const manifest = await loadV1();
    let served = '';
    handle.mutate('v1/sites.json', (bytes) => {
      served = new TextDecoder().decode(bytes).replace('"status": "degraded"', '"status": "great"');
      return served;
    });
    // Serve the mutation with a matching hash so the failure is the schema, not integrity.
    await loadContractSites(manifest).catch(() => undefined);
    expect(served).toContain('"status": "great"');
    const tampered = structuredClone(manifest);
    (tampered.artifacts.sites as { sha256: string }).sha256 = sha256(served);
    const error = await loadContractSites(tampered).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractSchemaError);
    expect((error as ContractSchemaError).path).toBe('v1/sites.json');
  });

  it('a manifest whose contract_version differs from the requested version raises ContractIntegrityError', async () => {
    handle.mutate('contract/v2.json', (bytes) => {
      const manifest = JSON.parse(new TextDecoder().decode(bytes)) as { contract_version: number };
      manifest.contract_version = 1;
      return JSON.stringify(manifest);
    });
    const error = await loadManifest(2, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractIntegrityError);
    expect((error as ContractIntegrityError).version).toBe(2);
  });

  it('a pointer whose manifest_uri disagrees with its contract_version is rejected', async () => {
    handle.mutate('contract/latest.json', (bytes) =>
      new TextDecoder().decode(bytes).replace('contract/v1.json', 'contract/v7.json')
    );
    await expect(loadLatestPointer()).rejects.toBeInstanceOf(ContractIntegrityError);
  });
});

describe('contractBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to the recorded CloudFront URL with exactly one trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_BASE_URL', '');
    expect(contractBaseUrl()).toBe(DEFAULT_CONTRACT_BASE_URL);
    expect(DEFAULT_CONTRACT_BASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.cloudfront\.net\/$/);
  });

  it('normalises an override to one trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_BASE_URL', 'https://contract.example.org/data///');
    expect(contractBaseUrl()).toBe('https://contract.example.org/data/');
  });

  it('accepts http only for localhost and 127.0.0.1', () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_BASE_URL', 'http://localhost:9000');
    expect(contractBaseUrl()).toBe('http://localhost:9000/');
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_BASE_URL', 'http://127.0.0.1:9000/x');
    expect(contractBaseUrl()).toBe('http://127.0.0.1:9000/x/');
  });

  it.each(['http://example.com', 'ftp://example.com', 'javascript:alert(1)', 'not a url', 'https://u:p@example.com/', 'https://example.com/?a=1'])(
    'rejects %s',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_CONTRACT_BASE_URL', value);
      expect(() => contractBaseUrl()).toThrow(ContractConfigError);
    }
  );
});

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('contract hooks', () => {
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

  it('useLegacySitesResponse is loading until the sites resolve, never "idle with nothing", then has 54 sites', async () => {
    const seen: Array<{ isLoading: boolean; hasData: boolean; hasError: boolean }> = [];
    const { result } = renderHook(
      () => {
        const value = useLegacySitesResponse();
        seen.push({ isLoading: value.isLoading, hasData: value.data !== undefined, hasError: Boolean(value.error) });
        return value;
      },
      { wrapper: wrapperFor(client) }
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data?.sites).toHaveLength(54));
    expect(result.current.isLoading).toBe(false);
    expect(seen.some((s) => !s.isLoading && !s.hasData && !s.hasError)).toBe(false);
  });

  it('keys versioned data by contract version so two versions never share a cache entry', async () => {
    const { result } = renderHook(() => useReferenceSites(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toHaveLength(54));
    const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain(JSON.stringify(['contract', 'latest']));
    expect(keys).toContain(JSON.stringify(['contract', 1, 'manifest']));
    expect(keys).toContain(JSON.stringify(['contract', 1, 'sites']));
  });

  it('a pinned version never requests the pointer', async () => {
    const { result } = renderHook(() => useContract(2), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.contract_version).toBe(2));
    expect(handle.requests).toEqual(['contract/v2.json']);
    expect(result.current.version).toBe(2);
  });

  it('a missing contract surfaces as a typed error, not as empty data', async () => {
    const { result } = renderHook(() => useContract(9), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ContractNotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
