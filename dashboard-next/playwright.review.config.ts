import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone Playwright config for the review-only unhidden captures (03-14).
 *
 * Runs only tests/e2e/review.spec.ts against a fresh build served on port 3100.
 * It imports nothing from the repository, so CI can copy it (with review.spec.ts)
 * into the checkout of the before ref and run the identical capture there.
 *
 * The gating projects in playwright.config.ts never run review.spec.ts.
 *
 *   REVIEW_OUT=review-captures npx playwright test -c playwright.review.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /review\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_PUBLIC_E2E_HOOKS: '1' },
  },
  use: {
    baseURL: 'http://localhost:3100',
  },
  projects: [
    {
      name: 'review',
      use: {
        ...devices['Desktop Chrome'],
        // Ask for software WebGL so maps render instead of showing their fallback panel
        // in headless Linux (research assumption A1). meta.json records what happened.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
});
