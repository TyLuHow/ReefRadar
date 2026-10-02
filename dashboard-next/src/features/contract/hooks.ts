'use client';

import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { expectedManifestSha256, loadArtifact, loadContractSites, loadLatestPointer, loadManifest } from './client';
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

/** Versioned artifact key; data reached through an unverified manifest never shares an entry with verified data (WR-02). */
function versionedKey(version: number | undefined, artifact: string, verified: boolean) {
  return verified ? ['contract', version, artifact] : ['contract', version, artifact, 'unverified'];
}

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
  /**
   * True when the manifest was checked against a sha256 (the pointer's, or the
   * bundled published hash). False only for a pinned version published after
   * this build, which is served unverified (WR-02).
   */
  verified: boolean;
  /** True only while there is neither data nor an error anywhere in the dependent chain. */
  isLoading: boolean;
  /**
   * A load failure with nothing to show. A failed background refresh (a
   * pointer refetch blip, a failed manual refetch) never lands here while
   * verified data is on screen; it is exposed as `refreshError` instead (WR-01).
   */
  error: Error | null;
  /** The most recent failed background refresh while data is still being served, else null. */
  refreshError: Error | null;
  refetch: () => Promise<void>;
}

interface ErrorSource {
  error: Error | null;
  data: unknown;
  isPlaceholderData: boolean;
}

/**
 * Split query errors into a visible error and a refresh error (WR-01). An error
 * from a query that holds its own real (non-placeholder) data is a failed
 * refresh of data that was already verified and displayed, so it must not
 * replace that data on screen.
 */
function splitErrors(sources: ErrorSource[]): { error: Error | null; refreshError: Error | null } {
  let error: Error | null = null;
  let refreshError: Error | null = null;
  for (const source of sources) {
    if (!source.error) continue;
    if (source.data !== undefined && !source.isPlaceholderData) refreshError ??= source.error;
    else error ??= source.error;
  }
  return { error, refreshError };
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
    pointerSha256: pinnedVersion !== undefined ? null : (pointer.data?.manifest_sha256 ?? null),
  };
}

/** The manifest of the pinned or latest contract version. */
export function useContract(version?: number): ContractQueryResult<ContractManifest> {
  const { pinned, following, pointer, paramError, resolvedVersion, pointerSha256 } = useContractVersion(version);

  // WR-02: the key records whether the manifest is hash-verified, so a manifest
  // fetched unverified can never satisfy the verified path in the same session.
  let manifestSha256: string | null = null;
  try {
    manifestSha256 = resolvedVersion === undefined ? null : expectedManifestSha256(resolvedVersion, pointerSha256);
  } catch {
    manifestSha256 = pointerSha256; // the mismatch is raised by loadManifest, as a typed error
  }
  const verified = manifestSha256 !== null;

  const manifest = useQuery({
    queryKey: verified ? ['contract', resolvedVersion, 'manifest'] : ['contract', resolvedVersion, 'manifest', 'unverified'],
    queryFn: () => loadManifest(resolvedVersion as number, pointerSha256),
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

  // WR-01: a failed pointer refresh is only an error while there is no manifest
  // to show; once the current version's manifest is held, it is a refreshError.
  const pointerSource: ErrorSource = {
    error: pointer.error as Error | null,
    data: manifest.data,
    isPlaceholderData: false,
  };
  const manifestSource: ErrorSource = {
    error: manifest.error as Error | null,
    data: manifest.data,
    isPlaceholderData: manifest.isPlaceholderData,
  };
  const split = splitErrors([manifestSource, pointerSource]);
  const error = (paramError ?? split.error ?? null) as Error | null;
  return {
    data: manifest.data,
    // The version the data belongs to: while a flip loads, the kept manifest's own version.
    version: manifest.data?.contract_version ?? resolvedVersion,
    following,
    verified,
    isLoading: manifest.data === undefined && error === null,
    error,
    refreshError: split.refreshError,
    refetch,
  };
}

/** The classifier model identity and provenance of the pinned or latest contract version. */
export function useModelVersion(version?: number): ContractQueryResult<ModelVersion> {
  const contract = useContract(version);
  const manifest = contract.data;

  const model = useQuery({
    queryKey: versionedKey(contract.version, 'model_version', contract.verified),
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

  const split = splitErrors([{ ...model, error: model.error as Error | null }]);
  const error = (split.error ?? contract.error ?? null) as Error | null;
  return {
    data: model.data,
    version: contract.version,
    following: contract.following,
    verified: contract.verified,
    isLoading: model.data === undefined && error === null,
    error,
    refreshError: split.refreshError ?? contract.refreshError,
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
    verified: contract.verified,
    isLoading: contract.isLoading,
    error: contract.error,
    refreshError: contract.refreshError,
    refetch: contract.refetch,
  };
}

/** The reference sites of the pinned or latest contract version. */
export function useReferenceSites(version?: number): ContractQueryResult<ContractSite[]> & { manifest: ContractManifest | undefined } {
  const contract = useContract(version);
  const manifest = contract.data;

  const sites = useQuery({
    queryKey: versionedKey(contract.version, 'sites', contract.verified),
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

  const split = splitErrors([{ ...sites, error: sites.error as Error | null }]);
  const error = (split.error ?? contract.error ?? null) as Error | null;
  return {
    data: sites.data,
    version: contract.version,
    following: contract.following,
    verified: contract.verified,
    manifest,
    isLoading: sites.data === undefined && error === null,
    error,
    refreshError: split.refreshError ?? contract.refreshError,
    refetch,
  };
}
