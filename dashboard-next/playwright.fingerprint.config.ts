import { defineConfig, devices } from '@playwright/test';

/**
 * Computed-style fingerprint run (Phase 4, plan 04-01).
 *
 * Builds and starts the app on port 3110 (3002-3006 belong to another project), dumps the
 * computed style of every element of the 11 legacy states at 1440 and 390 px into
 * $FINGERPRINT_OUT, and stops the server when the run ends. Compare two dumps with
 * `node scripts/style-fingerprint-diff.mjs <before> <after>`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /style-fingerprint\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  webServer: {
    command: 'npm run build && npm run start -- -p 3110',
    url: 'http://localhost:3110',
    reuseExistingServer: false,
    timeout: 300_000,
    env: { NEXT_PUBLIC_E2E_HOOKS: '1' },
  },
  use: {
    baseURL: 'http://localhost:3110',
  },
  projects: [{ name: 'fingerprint', use: { ...devices['Desktop Chrome'] } }],
});
