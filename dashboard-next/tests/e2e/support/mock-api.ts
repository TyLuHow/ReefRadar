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
 */

const API_HOST_PATTERN = /https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com\/prod\/.*/;

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures', 'api');

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
export async function mockApi(page: Page, overrides: MockApiOverrides = {}): Promise<void> {
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
    // live-API leak. Fail loudly with method + path rather than letting the
    // request hang or silently reach the network.
    throw new Error(
      `mockApi: unhandled API call ${method} ${apiPath} (full url: ${request.url()}). ` +
        `Add a fixture/override or a DEFAULT_FIXTURES entry in tests/e2e/support/mock-api.ts.`
    );
  });
}
