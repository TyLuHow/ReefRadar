import type { ZodType } from 'zod';
import { contractBaseUrl } from './config';
import { PUBLISHED_MANIFEST_SHA256 } from './published';
import {
  ContractFetchError,
  ContractIntegrityError,
  ContractNotFoundError,
  ContractSchemaError,
  ContractUriError,
} from './errors';
import {
  ARTIFACT_URI_PATTERN,
  ContractManifest,
  ContractPointer,
  ContractSitesFile,
  type ContractSite,
  type PresentArtifact,
} from './schema';

/**
 * The only contract fetch path in the app (02-07, CONTRACT-01).
 *
 * contract/latest.json -> contract/v<N>.json -> artifact. Every response
 * below the pointer is verified against the sha256 the pointer or manifest
 * promised (crypto.subtle) and then Zod-parsed. Nothing is returned that was
 * not both authentic and well-formed; every failure is a typed error
 * (errors.ts) carrying the version and artifact path, never a response body.
 */

const LATEST_PATH = 'contract/latest.json';

interface Where {
  version?: number;
  path: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes: ArrayBuffer, where: Where): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Fail closed: an insecure context cannot verify, so it must not trust.
    throw new ContractIntegrityError('This browser context cannot verify contract data (crypto.subtle is unavailable).', where);
  }
  return toHex(await subtle.digest('SHA-256', bytes));
}

/**
 * Resolve a manifest artifact uri against the base URL, accepting only a
 * plain relative contract path. An absolute, scheme-bearing, protocol-relative
 * or '..'-containing uri raises before any request (T-02-07-02).
 */
export function resolveArtifactUrl(base: string, uri: string, version?: number): string {
  if (typeof uri !== 'string' || !ARTIFACT_URI_PATTERN.test(uri)) {
    throw new ContractUriError('A contract artifact uri is not a plain relative contract path.', { version, path: String(uri).slice(0, 120) });
  }
  const resolved = new URL(uri, base).href;
  if (!resolved.startsWith(base)) {
    throw new ContractUriError('A contract artifact uri resolves outside the contract base URL.', { version, path: uri });
  }
  return resolved;
}

/**
 * GET one contract object, verify it and parse it.
 * `expectedSha256` null means the root of trust (the pointer) or an
 * unverifiable pinned manifest; every other call passes the promised hash.
 */
async function fetchVerified<T>(
  url: string,
  expectedSha256: string | null,
  schema: ZodType<T>,
  where: Where
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit' });
  } catch {
    throw new ContractFetchError('The contract could not be reached.', where);
  }

  if (response.status === 403 || response.status === 404) {
    throw new ContractNotFoundError(`Contract object not found (HTTP ${response.status}).`, where);
  }
  if (!response.ok) {
    throw new ContractFetchError(`The contract server answered HTTP ${response.status}.`, { ...where, status: response.status });
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    throw new ContractFetchError('The contract response could not be read.', where);
  }

  if (expectedSha256 !== null) {
    const actual = await sha256Hex(bytes, where);
    if (actual !== expectedSha256) {
      throw new ContractIntegrityError('Contract data does not match its published sha256 and was rejected.', where);
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ContractSchemaError('Contract data is not valid JSON.', where);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ContractSchemaError('Contract data does not match the contract schema.', where);
  }
  return parsed.data;
}

/** The only mutable object: contract/latest.json. */
export async function loadLatestPointer(): Promise<ContractPointer> {
  const pointer = await fetchVerified(`${contractBaseUrl()}${LATEST_PATH}`, null, ContractPointer, { path: LATEST_PATH });
  if (pointer.manifest_uri !== `contract/v${pointer.contract_version}.json`) {
    throw new ContractIntegrityError('The latest pointer names a manifest that does not belong to its version.', {
      version: pointer.contract_version,
      path: LATEST_PATH,
    });
  }
  return pointer;
}

/**
 * The sha256 a manifest must have: the pointer's when following latest, else
 * the bundled published hash for that version (WR-02), else null (a version
 * newer than this build: served, but unverified). When both a pointer hash and
 * a bundled hash exist they must agree, or the version has been rewritten.
 */
export function expectedManifestSha256(version: number, pointerSha256: string | null): string | null {
  const published = PUBLISHED_MANIFEST_SHA256[version] ?? null;
  if (pointerSha256 !== null && published !== null && pointerSha256 !== published) {
    throw new ContractIntegrityError('The latest pointer names a manifest that differs from the published one for its version.', {
      version,
      path: `contract/v${version}.json`,
    });
  }
  return pointerSha256 ?? published;
}

/**
 * contract/v<version>.json. `expectedSha256` comes from the pointer when
 * following latest. When a version is pinned (no pointer to vouch for it) it
 * is null and the bundled published hash for that version is used when known;
 * a version unknown to this build is the only unverified case (immutability
 * plus the artifact hashes it carries still hold).
 */
export async function loadManifest(version: number, expectedSha256: string | null): Promise<ContractManifest> {
  const path = `contract/v${version}.json`;
  const expected = expectedManifestSha256(version, expectedSha256);
  const manifest = await fetchVerified(`${contractBaseUrl()}${path}`, expected, ContractManifest, { version, path });
  if (manifest.contract_version !== version) {
    throw new ContractIntegrityError('The manifest is for a different contract version than the one requested.', { version, path });
  }
  return manifest;
}

type ArtifactEntry = ContractManifest['artifacts'][keyof ContractManifest['artifacts']];

function isPresent(entry: ArtifactEntry | undefined): entry is PresentArtifact {
  return entry !== undefined && typeof (entry as { uri?: unknown }).uri === 'string';
}

/**
 * Load, verify and parse one manifest artifact against `schema`. An artifact
 * the manifest marks absent raises ContractNotFoundError (it is not part of
 * this contract version), never returns empty data.
 */
export async function loadArtifact<T>(
  manifest: ContractManifest,
  key: keyof ContractManifest['artifacts'] & string,
  schema: ZodType<T>
): Promise<T> {
  const version = manifest.contract_version;
  const entry = manifest.artifacts[key] as ArtifactEntry | undefined;
  if (!isPresent(entry)) {
    throw new ContractNotFoundError(`This contract version does not contain "${key}".`, { version, path: key });
  }
  const url = resolveArtifactUrl(contractBaseUrl(), entry.uri, version);
  return fetchVerified(url, entry.sha256, schema, { version, path: entry.uri });
}

/** The reference sites of a manifest, verified and schema-checked. */
export async function loadContractSites(manifest: ContractManifest): Promise<ContractSite[]> {
  const file = await loadArtifact(manifest, 'sites', ContractSitesFile);
  const entry = manifest.artifacts.sites as ArtifactEntry;
  if (isPresent(entry) && entry.count !== undefined && entry.count !== file.sites.length) {
    throw new ContractIntegrityError('The number of sites does not match the manifest.', {
      version: manifest.contract_version,
      path: entry.uri,
    });
  }
  return file.sites;
}
