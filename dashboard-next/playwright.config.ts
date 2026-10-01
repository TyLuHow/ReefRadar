import { defineConfig, devices } from '@playwright/test';

/**
 * Local e2e + visual-regression Playwright config.
 *
 * Runs against a locally built-and-started Next.js server
 * (`npm run build && npm run start -- -p 3100`). Excludes the
 * live-deployment smoke specs (see playwright.live.config.ts).
 *
 * The "visual" project only produces meaningful, comparable screenshots
 * inside the official Playwright Docker image (CI, Linux). Visual specs
 * self-skip when PW_VISUAL is not "1", so local Windows runs of this
 * config skip screenshot assertions per D-21.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /.*-live\.spec\.ts/,
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  use: {
    baseURL: 'http://localhost:3100',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'e2e',
      // Project-level testIgnore REPLACES (does not merge with) the
      // top-level testIgnore above, so -live specs and the live-network
      // gallery-parity spec must be re-excluded here explicitly, or they
      // silently join this fixture-mocked project and hit the live API in
      // CI (01-08, D-22: e2e tests must never hit the live API).
      testIgnore: /visual\.spec\.ts|-live\.spec\.ts|gallery-parity\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
