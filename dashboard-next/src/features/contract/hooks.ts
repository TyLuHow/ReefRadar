'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadArtifact, loadContractSites, loadLatestPointer, loadManifest } from './client';
import { ContractFetchError } from './errors';
import { ModelVersion, type ContractManifest, type ContractSite, type Coverage } from './schema';

/**
 * TanStack hooks over the verified contract client (02-07).
 *
 * Query keys:
 *   ['contract', 'latest']        the pointer; refetched every 60 s
 *   ['contract', N, <artifact>]   versioned data; immutable, so staleTime
 *                                 and gcTime are Infinity
 * The version is in every versioned key, so two versions can never serve
 * each other's data, whatever order a flip and a refetch arrive in.
 *
 * Plan 02-08 supplies the ?cv= pin source; every hook already takes an
 * optional `version`. A pinned hook never requests the pointer.
 */

const POINTER_REFRESH_MS = 60_000;

/** Retry only what a retry can fix: a 5xx or network failure. Never a 403/404, integrity or schema error. */
function retryTransient(failureCount: number, error: unknown): boolean {
  return error instanceof ContractFetchError && failureCount < 2;
}

export interface ContractQueryResult<T> {
  data: T | undefined;
  /** The contract version the data belongs to (the pinned one, or the pointer's). */
  version: number | undefined;
  /** True only while there is neither data nor an error anywhere in the dependent chain. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Resolve the contract version: the pinned one, or the pointer's. A disabled
 * TanStack query reports isLoading false, so loading is always computed from
 * "no data and no error" rather than read from the query flags (Pitfall 15).
 */
function useContractVersion(version?: number) {
  const pinned = version !== undefined;
  const pointer = useQuery({
    queryKey: ['contract', 'latest'],
    queryFn: loadLatestPointer,
    enabled: !pinned,
    staleTime: POINTER_REFRESH_MS,
    refetchInterval: POINTER_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: retryTransient,
  });
  return {
    pinned,
    pointer,
    resolvedVersion: pinned ? version : pointer.data?.contract_version,
    manifestSha256: pinned ? null : (pointer.data?.manifest_sha256 ?? null),
  };
}

/** The manifest of the pinned or latest contract version. */
export function useContract(version?: number): ContractQueryResult<ContractManifest> {
  const { pinned, pointer, resolvedVersion, manifestSha256 } = useContractVersion(version);

  const manifest = useQuery({
    queryKey: ['contract', resolvedVersion, 'manifest'],
    queryFn: () => loadManifest(resolvedVersion as number, manifestSha256),
    enabled: resolvedVersion !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryTransient,
  });

  const refetchPointer = pointer.refetch;
  const refetchManifest = manifest.refetch;
  const refetch = useCallback(async () => {
    if (!pinned) await refetchPointer();
    await refetchManifest();
  }, [pinned, refetchPointer, refetchManifest]);

  const error = (manifest.error ?? pointer.error ?? null) as Error | null;
  return {
    data: manifest.data,
    version: resolvedVersion,
    isLoading: manifest.data === undefined && error === null,
    error,
    refetch,
  };
}

/** The classifier model identity and provenance of the pinned or latest contract version. */
export function useModelVersion(version?: number): ContractQueryResult<ModelVersion> {
  const contract = useContract(version);
  const manifest = contract.data;

  const model = useQuery({
    queryKey: ['contract', contract.version, 'model_version'],
    queryFn: () => loadArtifact(manifest as ContractManifest, 'model_version', ModelVersion),
    enabled: manifest !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryTransient,
  });

  const refetchContract = contract.refetch;
  const refetchModel = model.refetch;
  const refetch = useCallback(async () => {
    await refetchContract();
    await refetchModel();
  }, [refetchContract, refetchModel]);

  const error = (model.error ?? contract.error ?? null) as Error | null;
  return {
    data: model.data,
    version: contract.version,
    isLoading: model.data === undefined && error === null,
    error,
    refetch,
  };
}

/** What the pinned or latest contract version covers (the manifest's coverage block). */
export function useCoverage(version?: number): ContractQueryResult<Coverage> {
  const contract = useContract(version);
  return {
    data: contract.data?.coverage,
    version: contract.version,
    isLoading: contract.isLoading,
    error: contract.error,
    refetch: contract.refetch,
  };
}

/** The reference sites of the pinned or latest contract version. */
export function useReferenceSites(version?: number): ContractQueryResult<ContractSite[]> & { manifest: ContractManifest | undefined } {
  const contract = useContract(version);
  const manifest = contract.data;

  const sites = useQuery({
    queryKey: ['contract', contract.version, 'sites'],
    queryFn: () => loadContractSites(manifest as ContractManifest),
    enabled: manifest !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryTransient,
  });

  const refetchContract = contract.refetch;
  const refetchSites = sites.refetch;
  const refetch = useCallback(async () => {
    await refetchContract();
    await refetchSites();
  }, [refetchContract, refetchSites]);

  const error = (sites.error ?? contract.error ?? null) as Error | null;
  return {
    data: sites.data,
    version: contract.version,
    manifest,
    isLoading: sites.data === undefined && error === null,
    error,
    refetch,
  };
}
