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
    // Test-only hook: lets maps.spec.ts read the map instance from window.__reefMap.
    // Never set this in Vercel (T-03-08-02).
    env: {
      NEXT_PUBLIC_E2E_HOOKS: '1',
      // Dev fixtures route for e2e and visual builds only. Never set this in Vercel.
      NEXT_PUBLIC_DEV_FIXTURES: '1',
    },
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
      // review.spec.ts (03-14) is the unhidden before/after capture run by
      // playwright.review.config.ts only; it asserts nothing and must never gate.
      // The computed-style fingerprint spec (04-01) runs only under playwright.fingerprint.config.ts and needs FINGERPRINT_OUT.
      // The fixtures screenshot spec (04-23) belongs to the fixtures-shots project only: its baselines are Docker-pinned
      // and must never run, or fail, inside this fixture-mocked project. The pattern is anchored so it cannot swallow
      // the other fixtures-*.spec.ts browser gates, which stay in this project.
      testIgnore: /visual\.spec\.ts|-live\.spec\.ts|gallery-parity\.spec\.ts|review\.spec\.ts|style-fingerprint\.spec\.ts|(^|[\\/])fixtures\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Element screenshots of every /dev/fixtures section and state grid (04-23, DS-08). Its own project, spec and
      // snapshot directory, so regenerating these never touches the 33 legacy baselines (guarded by
      // tests/unit/legacy-baselines.test.ts). Self-skips unless PW_VISUAL=1 (Docker-pinned Linux CI). reducedMotion
      // is emulated so the kit's motion is already at its reduced-motion state before every capture.
      name: 'fixtures-shots',
      testMatch: /(^|[\\/])fixtures\.spec\.ts$/,
      snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
  ],
});
