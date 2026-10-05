/**
 * PLAT-10 (CAP-09): one API client, and it honours the configured base URL.
 *
 * Two halves:
 *  1. Behaviour: with NEXT_PUBLIC_API_URL set, every api.* flow requests URLs under it;
 *     with it unset they fall back to the documented API Gateway URL.
 *  2. Fence: nothing under src other than src/lib/api.ts names the API host or the env
 *     var, and every fetch( call site in src is on a reviewed allowlist. The fence is
 *     proven non-vacuous by running the checker on a planted violation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve(__dirname, '../..');
const SRC_ROOT = path.join(DASHBOARD_ROOT, 'src');

const DEFAULT_API_URL = 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';
const CONFIGURED_API_URL = 'https://example.test/prod';

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

/** Imports a fresh copy of the singleton so the module-level API_URL is re-read from the env. */
async function freshApi() {
  vi.resetModules();
  const mod = await import('@/lib/api');
  return mod.api;
}

async function exerciseEveryFlow(api: Awaited<ReturnType<typeof freshApi>>, fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/status/')) return okResponse({ analysis_id: 'a1', stage: 'complete', status: 'complete' });
    if (u.includes('/visualize/')) return okResponse({ analysis_id: 'a1', status: 'complete' });
    if (u.endsWith('/health')) return okResponse({ status: 'healthy' });
    if (u.endsWith('/samples')) return okResponse({ samples: [], stories: [] });
    if (u.endsWith('/upload')) return okResponse({ upload_id: 'u1', status: 'uploaded' });
    if (u.endsWith('/analyze')) return okResponse({ analysis_id: 'a1', status: 'processing' });
    return okResponse({});
  });

  const file = { name: 'x.wav', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
  await api.getHealth();
  await api.getSamples();
  await api.uploadAudio(file);
  await api.startAnalysis('u1', 1, 2);
  await api.getStatus('a1');
  await api.getAnalysisResult('a1');
  await api.pollAnalysis('a1'); // status -> complete -> one /visualize call

  return fetchMock.mock.calls.map(([url]) => String(url));
}

describe('ApiClient base URL (CAP-09)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('builds every flow URL from NEXT_PUBLIC_API_URL when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', CONFIGURED_API_URL);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = await freshApi();

    const urls = await exerciseEveryFlow(api, fetchMock);

    expect(urls.length).toBeGreaterThanOrEqual(7);
    for (const url of urls) {
      expect(url.startsWith(`${CONFIGURED_API_URL}/`)).toBe(true);
    }
    const paths = urls.map((u) => u.slice(CONFIGURED_API_URL.length));
    expect(paths).toEqual(
      expect.arrayContaining(['/health', '/samples', '/upload', '/analyze', '/status/a1', '/visualize/a1'])
    );
  });

  it('falls back to the documented API Gateway URL when the variable is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = await freshApi();

    const urls = await exerciseEveryFlow(api, fetchMock);

    expect(urls.length).toBeGreaterThanOrEqual(7);
    for (const url of urls) {
      expect(url.startsWith('https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/')).toBe(true);
    }
    expect(urls[0]).toBe(`${DEFAULT_API_URL}/health`);
  });
});

// ---------------------------------------------------------------------------------------
// Source fence
// ---------------------------------------------------------------------------------------

/** Repo-relative POSIX paths (relative to dashboard-next) of files allowed to call fetch(. */
const FETCH_ALLOWLIST = new Set([
  'src/lib/api.ts', // the one API client
  'src/features/contract/client.ts', // the contract client (verifies sha256 + Zod)
  'src/features/monitoring/report.ts', // monitoring reporter (added by 03-12; may not exist yet)
  'src/components/audio/AudioCompare.tsx', // same-origin audio loader
  'src/components/experience/useDemoAudio.ts', // same-origin audio loader
  'src/components/experience/useLocationAudio.ts', // same-origin audio loader
  'src/features/instrument/useClipSpectrogram.ts', // same-origin /audio/ wav loader for the spectrogram wells (04-13); isClipPath refuses any other path before fetch
]);

const API_HOME = 'src/lib/api.ts';

/** `fetch(` as a call, not `refetch(` or `obj.fetch(`. */
const FETCH_CALL = /(?<![\w.$])fetch\s*\(/;

/** Pure checker: returns the file paths in `files` that contain a fetch( call but are not allowlisted. */
export function findDisallowedFetchSites(
  files: Array<{ path: string; text: string }>,
  allowlist: ReadonlySet<string> = FETCH_ALLOWLIST
): string[] {
  return files.filter((f) => FETCH_CALL.test(f.text) && !allowlist.has(f.path)).map((f) => f.path);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function readSourceFiles(): Array<{ path: string; text: string }> {
  return walk(SRC_ROOT).map((full) => ({
    path: path.relative(DASHBOARD_ROOT, full).split(path.sep).join('/'),
    text: fs.readFileSync(full, 'utf-8'),
  }));
}

describe('API source fence (T-03-01-01)', () => {
  const files = readSourceFiles();

  it('walks a real source tree', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.path === API_HOME)).toBe(true);
  });

  it('names the API Gateway host and the base-URL env var only in src/lib/api.ts', () => {
    const hostFiles = files.filter((f) => f.text.includes('execute-api')).map((f) => f.path);
    const envFiles = files.filter((f) => f.text.includes('NEXT_PUBLIC_API_URL')).map((f) => f.path);
    expect(hostFiles).toEqual([API_HOME]);
    expect(envFiles).toEqual([API_HOME]);
  });

  it('uses no XMLHttpRequest or axios anywhere in src', () => {
    const offenders = files.filter((f) => /XMLHttpRequest|from ['"]axios['"]|require\(['"]axios['"]\)/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('has every fetch( call site on the reviewed allowlist', () => {
    expect(findDisallowedFetchSites(files)).toEqual([]);
  });

  it('actually performs fetch( calls from the allowlisted client files (allowlist is not stale)', () => {
    const callers = files.filter((f) => FETCH_CALL.test(f.text)).map((f) => f.path);
    expect(callers).toContain(API_HOME);
    expect(callers).toContain('src/features/contract/client.ts');
  });

  it('reports a planted fetch( call in a non-allowlisted file (the fence is not vacuous)', () => {
    const planted = [
      ...files,
      { path: 'src/components/Planted.tsx', text: "export const x = () => fetch('https://evil.example/api');" },
    ];
    expect(findDisallowedFetchSites(planted)).toEqual(['src/components/Planted.tsx']);
  });

  it('does not flag refetch( or method-style .fetch( calls', () => {
    const benign = [
      { path: 'src/a.tsx', text: 'onClick={() => refetch()}' },
      { path: 'src/b.ts', text: 'client.fetch(x)' },
    ];
    expect(findDisallowedFetchSites(benign)).toEqual([]);
  });
});
