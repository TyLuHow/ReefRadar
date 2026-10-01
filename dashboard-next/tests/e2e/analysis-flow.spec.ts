import { test, expect, type Route } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mockApi } from './support/mock-api';

/**
 * Fixture-driven upload -> analyze -> /status sequence -> result e2e for
 * both legacy analyze flows (01-16, D-15).
 *
 * Both /dashboard/analyze and /experience poll GET /status/{id} and must
 * show only the real pipeline stage the API reports -- never a scripted
 * message or an invented percentage. Every API call is mocked via
 * mockApi/mock-api.ts fixtures; this suite never reaches the live API
 * (01-08, D-22).
 */

const AUDIO_FIXTURE = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'audio',
  'marrs',
  'aus_D1_20230208_120000.wav'
);

interface StatusSequenceEntry {
  statusCode: number;
  body: unknown;
}

const STATUS_SEQUENCE: StatusSequenceEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'api', 'status-sequence.json'), 'utf-8')
);

/** Returns a GET /status/* handler that replays STATUS_SEQUENCE in order, one entry per call. */
function sequencedStatusHandler() {
  let index = 0;
  return async (route: Route) => {
    const entry = STATUS_SEQUENCE[Math.min(index, STATUS_SEQUENCE.length - 1)];
    index += 1;
    await route.fulfill({
      status: entry.statusCode,
      contentType: 'application/json',
      body: JSON.stringify(entry.body),
    });
  };
}

test.describe('/dashboard/analyze -- real /status stages (D-15)', () => {
  test('shows real pipeline stages in order, renders results, and never shows a fake percentage', async ({ page }) => {
    await mockApi(page, {
      'POST /upload': { upload_id: 'up-1', filename: 'aus_D1_20230208_120000.wav', size: 1000, status: 'uploaded' },
      'POST /analyze': { analysis_id: 'fixture-sequence', upload_id: 'up-1', status: 'processing' },
      'GET /status/*': sequencedStatusHandler(),
      'GET /visualize/*': 'visualize-3class-no-coords.json',
    });

    await page.goto('/dashboard/analyze');
    await page.setInputFiles('input[type="file"]', AUDIO_FIXTURE);
    await page.getByRole('button', { name: /analyze audio/i }).click();

    await expect(page.getByText(/Preparing audio/i)).toBeVisible();
    await expect(page.getByText(/Classifying 6 audio segments/i)).toBeVisible();

    // Completion is signalled by the reset control replacing the progress UI.
    await expect(page.getByRole('button', { name: /analyze another file/i })).toBeVisible({ timeout: 20000 });

    await expect(page.getByText(/%\s*complete/i)).toHaveCount(0);
  });

  test('shows the API message, suggestion and request id on a failed analysis', async ({ page }) => {
    await mockApi(page, {
      'POST /upload': { upload_id: 'up-2', filename: 'aus_D1_20230208_120000.wav', size: 1000, status: 'uploaded' },
      'POST /analyze': { analysis_id: 'fixture-failed', upload_id: 'up-2', status: 'processing' },
      'GET /status/*': {
        analysis_id: 'fixture-failed',
        stage: 'classifying',
        status: 'failed',
        error: {
          code: 'CLASSIFY_FAILED',
          message: 'Model inference failed',
          suggestion: 'Please retry the analysis',
        },
      },
      'GET /visualize/*': {
        analysis_id: 'fixture-failed',
        status: 'failed',
        error: {
          code: 'CLASSIFY_FAILED',
          message: 'Model inference failed',
          suggestion: 'Please retry the analysis',
          request_id: 'req-e2e-1',
        },
      },
    });

    await page.goto('/dashboard/analyze');
    await page.setInputFiles('input[type="file"]', AUDIO_FIXTURE);
    await page.getByRole('button', { name: /analyze audio/i }).click();

    const progressPanel = page.getByRole('main');
    await expect(progressPanel.getByText('Model inference failed')).toBeVisible({ timeout: 20000 });
    await expect(progressPanel.getByText('Please retry the analysis')).toBeVisible();
    await expect(progressPanel.getByText(/req-e2e-1/)).toBeVisible();
  });
});
