import { defineConfig, devices } from '@playwright/test';

/**
 * Live-deployment Playwright config.
 *
 * Runs tests against the already-deployed dashboard-next app on Vercel.
 * No local server is started — HEAD does not build locally yet (missing
 * gallery files recovered in a later plan), so baselines and smoke tests
 * target the live deployment instead.
 *
 * Only files ending in -live.spec.ts are picked up by this config.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*-live\.spec\.ts/,
  retries: 1,
  reporter: 'list',
  outputDir: 'test-results/live',
  use: {
    baseURL: process.env.PW_LIVE_BASE_URL || 'https://dashboard-next-indol-nu.vercel.app',
  },
  projects: [
    {
      name: 'live',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
