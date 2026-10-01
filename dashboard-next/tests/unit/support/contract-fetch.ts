import * as fs from 'node:fs';
import * as path from 'node:path';
import { vi } from 'vitest';
import { DEFAULT_CONTRACT_BASE_URL } from '@/features/contract/config';

/**
 * Offline fetch harness for the contract module (02-07).
 *
 * Stubs globalThis.fetch with a function that serves the contract from the
 * committed files, exactly as the CDN would: contract/latest.json from
 * contracts/fixtures/latest-v<N>.json, contract/v2.json from
 * contracts/fixtures/bucket/contract/v2.json, everything else from
 * contracts/bucket. A missing file answers 403 (what the production bucket
 * answers for an absent key). Any request outside the contract base URL is
 * recorded and refused, so a unit test can never reach a real host.
 */

// tests/unit/support -> unit -> tests -> dashboard-next -> repo root
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUCKET_DIR = path.join(REPO_ROOT, 'contracts', 'bucket');
const FIXTURES_DIR = path.join(REPO_ROOT, 'contracts', 'fixtures');

export type Transform = (bytes: Uint8Array) => Uint8Array | string;

export interface ContractFetchHandle {
  /** Choose which pointer fixture contract/latest.json serves (latest-v<n>.json). */
  setLatest(version: number): void;
  /** Contract-relative paths requested so far (e.g. "contract/latest.json"), in order. */
  requests: string[];
  /** RequestInit objects passed to fetch, in order. */
  inits: Array<RequestInit | undefined>;
  /** Requests that were refused because they were not under the contract base URL. */
  refused: string[];
  /** Alter the bytes served for one contract-relative path (a tampering test). */
  mutate(contractPath: string, transform: Transform): void;
  restore(): void;
}

function readFixtureFile(contractPath: string, latest: number): Buffer | null {
  let file: string;
  if (contractPath === 'contract/latest.json') {
    file = path.join(FIXTURES_DIR, `latest-v${latest}.json`);
  } else if (contractPath === 'contract/v2.json') {
    file = path.join(FIXTURES_DIR, 'bucket', 'contract', 'v2.json');
  } else {
    file = path.join(BUCKET_DIR, ...contractPath.split('/'));
  }
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(REPO_ROOT, 'contracts'))) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? fs.readFileSync(resolved) : null;
}

export function installContractFetch(options: { latest?: number } = {}): ContractFetchHandle {
  let latest = options.latest ?? 1;
  const requests: string[] = [];
  const inits: Array<RequestInit | undefined> = [];
  const refused: string[] = [];
  const transforms = new Map<string, Transform>();

  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    inits.push(init);
    if (!url.startsWith(DEFAULT_CONTRACT_BASE_URL)) {
      refused.push(url);
      throw new TypeError(`contract-fetch: refusing a request outside the contract base URL: ${url}`);
    }
    const contractPath = url.slice(DEFAULT_CONTRACT_BASE_URL.length);
    requests.push(contractPath);

    const file = readFixtureFile(contractPath, latest);
    if (file === null) {
      return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    }
    let body: Uint8Array | string = new Uint8Array(file);
    const transform = transforms.get(contractPath);
    if (transform) body = transform(new Uint8Array(file));
    return new Response(body as BodyInit, {
      status: 200,
      headers: { 'content-type': contractPath.endsWith('.json') ? 'application/json' : 'application/octet-stream' },
    });
  });

  const original = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;

  return {
    setLatest(version: number) {
      latest = version;
    },
    requests,
    inits,
    refused,
    mutate(contractPath, transform) {
      transforms.set(contractPath, transform);
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** Parse a committed contract file (for expectations). */
export function readContractJson(relative: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ...relative.split('/')), 'utf-8'));
}
