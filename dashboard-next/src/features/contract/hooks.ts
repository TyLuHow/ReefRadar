'use client';

import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { loadArtifact, loadContractSites, loadLatestPointer, loadManifest } from './client';
import { ContractFetchError, ContractVersionParamError } from './errors';
import { echoParam, useContractVersionStore } from './version';
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
 * Which version a hook serves (02-08, CONTRACT-04):
 *   - an explicit `version` argument always wins (result stamps pass one);
 *   - otherwise the URL decides, through the version store that
 *     ContractVersionSync fills from ?cv=: nothing is requested until the URL
 *     has been read; ?cv=N serves exactly N and never requests the pointer;
 *     an invalid ?cv= is an error with no request at all, never latest;
 *   - with no ?cv= the hook follows latest.json (60 s refetch, no reload).
 * While following latest, the previous version's data stays on screen until the
 * next version has loaded, so a flip never blanks the page.
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
  /** True when this result follows latest.json (no pin, no explicit version). */
  following: boolean;
  /** True only while there is neither data nor an error anywhere in the dependent chain. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Resolve the contract version: explicit, URL-pinned, or the pointer's. A
 * disabled TanStack query reports isLoading false, so loading is always
 * computed from "no data and no error" rather than read from the query flags
 * (Pitfall 15).
 */
function useContractVersion(version?: number) {
  const explicit = version !== undefined;
  const urlResolved = useContractVersionStore((state) => state.resolved);
  const pin = useContractVersionStore((state) => state.pin);

  const ready = explicit || urlResolved;
  const invalidRaw = !explicit && urlResolved && pin.kind === 'invalid' ? pin.raw : null;
  const pinnedVersion = explicit ? version : pin.kind === 'pinned' ? pin.version : undefined;
  const following = ready && invalidRaw === null && pinnedVersion === undefined;

  const pointer = useQuery({
    queryKey: ['contract', 'latest'],
    queryFn: loadLatestPointer,
    enabled: following,
    staleTime: POINTER_REFRESH_MS,
    refetchInterval: POINTER_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: retryTransient,
  });

  const paramError = useMemo(
    () => (invalidRaw === null ? null : new ContractVersionParamError(`"${echoParam(invalidRaw)}" is not a valid contract version`)),
    [invalidRaw]
  );

  const resolvedVersion = !ready || invalidRaw !== null ? undefined : (pinnedVersion ?? pointer.data?.contract_version);
  return {
    pinned: pinnedVersion !== undefined,
    following,
    pointer,
    paramError,
    resolvedVersion,
    manifestSha256: pinnedVersion !== undefined ? null : (pointer.data?.manifest_sha256 ?? null),
  };
}

/** The manifest of the pinned or latest contract version. */
export function useContract(version?: number): ContractQueryResult<ContractManifest> {
  const { pinned, following, pointer, paramError, resolvedVersion, manifestSha256 } = useContractVersion(version);

  const manifest = useQuery({
    queryKey: ['contract', resolvedVersion, 'manifest'],
    queryFn: () => loadManifest(resolvedVersion as number, manifestSha256),
    enabled: resolvedVersion !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryTransient,
    placeholderData: following ? keepPreviousData : undefined,
  });

  const refetchPointer = pointer.refetch;
  const refetchManifest = manifest.refetch;
  const refetch = useCallback(async () => {
    if (!pinned) await refetchPointer();
    await refetchManifest();
  }, [pinned, refetchPointer, refetchManifest]);

  const error = (paramError ?? manifest.error ?? pointer.error ?? null) as Error | null;
  return {
    data: manifest.data,
    // The version the data belongs to: while a flip loads, the kept manifest's own version.
    version: manifest.data?.contract_version ?? resolvedVersion,
    following,
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
    placeholderData: contract.following ? keepPreviousData : undefined,
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
    following: contract.following,
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
    following: contract.following,
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
    placeholderData: contract.following ? keepPreviousData : undefined,
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
    following: contract.following,
    manifest,
    isLoading: sites.data === undefined && error === null,
    error,
    refetch,
  };
}
