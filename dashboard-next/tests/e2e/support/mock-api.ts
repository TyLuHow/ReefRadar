import { Page, Route } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * API mock helper (01-08, D-22).
 *
 * Routes every call to the live execute-api host (the same host both
 * src/lib/api.ts's default NEXT_PUBLIC_API_URL and the hard-coded
 * API_BASE in src/app/experience/page.tsx point at) through committed
 * fixtures instead of the network. e2e tests must never hit the live API.
 *
 * It also installs mockContract() (02-07): the published data contract is
 * served from the committed files under contracts/, so no spec reaches a real
 * CloudFront host (CONTRACT-05).
 */

/**
 * Unhandled API calls recorded per page. A throw inside a page.route handler
 * is not reliably propagated to the running test (and the request can hang
 * until the test times out), so an unhandled call is recorded, the request is
 * aborted (the app sees a network failure instead of hanging), and each spec
 * asserts the list is empty in an afterEach via expectNoUnhandledApiCalls().
 */
const UNHANDLED = new WeakMap<Page, string[]>();

export function unhandledApiCalls(page: Page): string[] {
  return UNHANDLED.get(page) ?? [];
}

/** Call from `test.afterEach`: fails the test if any API call had no fixture/override. */
export function expectNoUnhandledApiCalls(page: Page): void {
  const calls = unhandledApiCalls(page);
  if (calls.length > 0) {
    throw new Error(
      `mockApi: ${calls.length} unhandled API call(s) -- add a fixture/override or a DEFAULT_FIXTURES entry in ` +
        `tests/e2e/support/mock-api.ts:\n  ${calls.join('\n  ')}`
    );
  }
}

const API_HOST_PATTERN = /https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com\/prod\/.*/;

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures', 'api');

// ---- data contract (02-07) ------------------------------------------------

// tests/e2e/support -> e2e -> tests -> dashboard-next -> repo root
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const CONTRACT_BUCKET_DIR = path.join(REPO_ROOT, 'contracts', 'bucket');
const CONTRACT_FIXTURES_DIR = path.join(REPO_ROOT, 'contracts', 'fixtures');

/** Any CloudFront host: the app's contract base URL (src/features/contract/config.ts). */
const CONTRACT_HOST_PATTERN = /^https:\/\/[a-z0-9]+\.cloudfront\.net\/.*/;

export interface ContractMockController {
  /** Choose which pointer fixture contract/latest.json serves (contracts/fixtures/latest-v<n>.json). */
  setLatest(version: number): void;
  /** Contract-relative paths requested through this mock, in order. */
  requests: string[];
}

function contractFile(contractPath: string, latest: number): string | null {
  let file: string;
  if (contractPath === 'contract/latest.json') {
    file = path.join(CONTRACT_FIXTURES_DIR, `latest-v${latest}.json`);
  } else if (contractPath === 'contract/v2.json') {
    file = path.join(CONTRACT_FIXTURES_DIR, 'bucket', 'contract', 'v2.json');
  } else {
    file = path.join(CONTRACT_BUCKET_DIR, ...contractPath.split('/'));
  }
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(REPO_ROOT, 'contracts') + path.sep)) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

/**
 * Serve the data contract from disk, exactly as CloudFront would: latest.json
 * from the chosen pointer fixture, v2.json from the flipped-flag fixture,
 * everything else from contracts/bucket. An absent key answers 403 (what the
 * production bucket answers). Responses carry access-control-allow-origin "*"
 * and the production Cache-Control (latest 60 s, everything else immutable).
 * Contract fixtures are never imported from src/ or public/.
 *
 * mockApi() installs this for every spec; a spec that needs another version
 * calls mockContract(page, { latest: 2 }) afterwards (the later route wins).
 */
export async function mockContract(page: Page, options: { latest?: number } = {}): Promise<ContractMockController> {
  let latest = options.latest ?? 1;
  const requests: string[] = [];
  await page.route(CONTRACT_HOST_PATTERN, async (route) => {
    const contractPath = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\//, ''));
    requests.push(contractPath);
    const file = contractFile(contractPath, latest);
    const cors = { 'access-control-allow-origin': '*' };
    if (file === null) {
      await route.fulfill({ status: 403, headers: cors, contentType: 'application/xml', body: '<Error><Code>AccessDenied</Code></Error>' });
      return;
    }
    const isLatest = contractPath === 'contract/latest.json';
    await route.fulfill({
      status: 200,
      headers: {
        ...cors,
        'cache-control': isLatest ? 'public, max-age=60' : 'public, max-age=31536000, immutable',
      },
      contentType: file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      body: fs.readFileSync(file),
    });
  });
  return {
    setLatest(version: number) {
      latest = version;
    },
    requests,
  };
}

export type FixtureOverride =
  | string // JSON fixture filename under tests/fixtures/api/
  | Record<string, unknown> // inline JSON body
  | ((route: Route) => Promise<void> | void); // custom handler, full control

/**
 * Keys are "METHOD /path", e.g. "GET /status/abc123". A trailing "*" on
 * the path matches as a prefix, e.g. "GET /status/*" matches any analysis
 * id. health/sites/samples already have sane defaults below; everything
 * else (status/{id}, visualize/{id}, results/{id}, upload, analyze) must
 * be supplied via overrides by the test that needs it.
 */
export type MockApiOverrides = Record<string, FixtureOverride>;

const DEFAULT_FIXTURES: Record<string, string> = {
  'GET /health': 'health.json',
  'GET /sites': 'sites.json',
  'GET /samples': 'samples.json',
};

function loadFixture(name: string): unknown {
  const file = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function findOverride(overrides: MockApiOverrides, method: string, apiPath: string): FixtureOverride | undefined {
  const exactKey = `${method} ${apiPath}`;
  if (overrides[exactKey] !== undefined) return overrides[exactKey];

  for (const key of Object.keys(overrides)) {
    const [m, p] = key.split(' ');
    if (m !== method || !p) continue;
    if (p.endsWith('*') && apiPath.startsWith(p.slice(0, -1))) {
      return overrides[key];
    }
  }
  return undefined;
}

async function applyOverride(route: Route, override: FixtureOverride): Promise<void> {
  if (typeof override === 'function') {
    await override(route);
    return;
  }
  const body = typeof override === 'string' ? loadFixture(override) : override;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Install API mocking on `page`. Must be called before `page.goto(...)`.
 *
 * `overrides` lets a test supply fixtures/handlers for paths that have no
 * sensible global default (dynamic analysis ids, upload/analyze POSTs) or
 * to replace a default (e.g. a non-200 /health for an error-state test).
 */
export async function mockApi(page: Page, overrides: MockApiOverrides = {}): Promise<ContractMockController> {
  UNHANDLED.set(page, []);
  const contract = await mockContract(page);
  await page.route(API_HOST_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    // Strip everything up to and including "/prod" so keys are stage-agnostic.
    const apiPath = url.pathname.replace(/^.*\/prod/, '') || '/';

    const override = findOverride(overrides, method, apiPath);
    if (override !== undefined) {
      await applyOverride(route, override);
      return;
    }

    const defaultFixture = DEFAULT_FIXTURES[`${method} ${apiPath}`];
    if (defaultFixture) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(loadFixture(defaultFixture)),
      });
      return;
    }

    // No fixture/override/default matched: this is either a test gap or a
    // live-API leak. Record it (method + path only), abort the request so the
    // app does not hang, and let the spec's afterEach fail the test.
    unhandledApiCalls(page).push(`${method} ${apiPath}`);
    await route.abort('failed');
  });
  return contract;
}
