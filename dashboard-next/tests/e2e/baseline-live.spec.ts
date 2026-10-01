import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Pre-redesign regression baseline (D-20, TRUTH-10).
 *
 * Captures the live production deployment — not a local build — because
 * HEAD cannot build yet (SampleGallery/lib/samples missing until plan
 * 01-07). This is exactly the app users see today, so it is the correct
 * "before" artifact to review later legacy-UI and redesign changes against.
 *
 * Output: screenshots + axe reports + a capture manifest under
 * dashboard-next/tests/baseline/pre-truth/. This directory is REFERENCED,
 * NEVER REGENERATED once the full phase is captured — see README.md.
 */

interface StateDef {
  name: string;
  path: string;
  /** Extra settle time (ms) after networkidle, beyond the default. */
  extraWaitMs?: number;
}

interface WidthDef {
  label: string;
  width: number;
  height: number;
}

// Full 11-state x 3-width matrix (Task 1 tracer proved the pipeline on
// "landing" @ 1440 alone).
const STATES: StateDef[] = [
  { name: 'landing', path: '/' },
  { name: 'about', path: '/about/' },
  { name: 'sites', path: '/sites/' },
  { name: 'dashboard', path: '/dashboard/' },
  { name: 'analyze', path: '/dashboard/analyze/' },
  { name: 'compare', path: '/dashboard/compare/' },
  { name: 'map', path: '/dashboard/map/', extraWaitMs: 4000 },
  { name: 'experience', path: '/experience/' },
  { name: 'experience-demo', path: '/experience/?mode=demo' },
  { name: 'experience-compare', path: '/experience/?mode=compare' },
  { name: 'experience-sample', path: '/experience/?sample=idn_healthy_dawn' },
];

const WIDTHS: WidthDef[] = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '390', width: 390, height: 844 },
];

const BASELINE_DIR = path.join(__dirname, '..', 'baseline', 'pre-truth');
const SCREENSHOTS_DIR = path.join(BASELINE_DIR, 'screenshots');
const AXE_DIR = path.join(BASELINE_DIR, 'axe');
const ROUTES_JSON = path.join(BASELINE_DIR, 'routes.json');

const REPO_HEAD = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..', '..', '..') })
  .toString()
  .trim();
const BASE_URL = process.env.PW_LIVE_BASE_URL || 'https://dashboard-next-indol-nu.vercel.app';

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(AXE_DIR, { recursive: true });

interface RouteEntry {
  state: string;
  path: string;
  width: number;
  file: string;
  captured_at: string;
  base_url: string;
  repo_head: string;
  render_note?: string;
}

function readRoutes(): RouteEntry[] {
  if (!fs.existsSync(ROUTES_JSON)) return [];
  try {
    return JSON.parse(fs.readFileSync(ROUTES_JSON, 'utf-8'));
  } catch {
    return [];
  }
}

function appendRoute(entry: RouteEntry) {
  const routes = readRoutes().filter(
    (r) => !(r.state === entry.state && r.width === entry.width)
  );
  routes.push(entry);
  fs.writeFileSync(ROUTES_JSON, JSON.stringify(routes, null, 2) + '\n');
}

/**
 * Redact presigned-S3 query strings from axe html/target strings so no
 * temporary credential token is ever committed (T-01-04-01).
 */
function redactPresigned(value: string): string {
  return value.replace(
    /\?[^"'\s]*(?:X-Amz-|AWSAccessKeyId=)[^"'\s]*/g,
    '?<redacted-presigned-query>'
  );
}

function redactAxeResults(results: unknown): unknown {
  const json = JSON.stringify(results, (_key, value) => {
    if (typeof value === 'string' && /X-Amz-|AWSAccessKeyId=/.test(value)) {
      return redactPresigned(value);
    }
    return value;
  });
  return JSON.parse(json);
}

for (const state of STATES) {
  for (const w of WIDTHS) {
    test(`baseline: ${state.name} @ ${w.label}`, async ({ page }) => {
      await page.setViewportSize({ width: w.width, height: w.height });

      let renderNote: string | undefined;
      try {
        await page.goto(state.path, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 30000 });
      } catch (e) {
        renderNote = `navigation/networkidle issue: ${(e as Error).message}`;
      }

      if (state.name === 'landing') {
        try {
          await page
            .getByText('Loading samples...')
            .waitFor({ state: 'detached', timeout: 15000 });
        } catch {
          renderNote = (renderNote ? renderNote + '; ' : '') + '"Loading samples..." did not detach in time';
        }
      }

      // Let canvas/WebGL settle (particles, deck.gl tiles, etc.).
      await page.waitForTimeout(state.extraWaitMs ?? 2000);

      const screenshotFile = `${state.name}-${w.label}.jpg`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFile);
      try {
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
          type: 'jpeg',
          quality: 85,
        });
      } catch (e) {
        renderNote = (renderNote ? renderNote + '; ' : '') + `screenshot failed: ${(e as Error).message}`;
      }

      const entry: RouteEntry = {
        state: state.name,
        path: state.path,
        width: w.width,
        file: screenshotFile,
        captured_at: new Date().toISOString(),
        base_url: BASE_URL,
        repo_head: REPO_HEAD,
      };
      if (renderNote) entry.render_note = renderNote;
      appendRoute(entry);

      // Axe only at the 1440 (desktop) width, per plan.
      if (w.width === 1440) {
        try {
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          const redacted = redactAxeResults(results);
          fs.writeFileSync(
            path.join(AXE_DIR, `${state.name}.json`),
            JSON.stringify(redacted, null, 2) + '\n'
          );
        } catch (e) {
          // Still record that axe failed for this state rather than
          // silently producing no file.
          fs.writeFileSync(
            path.join(AXE_DIR, `${state.name}.json`),
            JSON.stringify({ error: (e as Error).message }, null, 2) + '\n'
          );
        }
      }
    });
  }
}
