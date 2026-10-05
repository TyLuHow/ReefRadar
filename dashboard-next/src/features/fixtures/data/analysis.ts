import captured from '../../../../tests/fixtures/api/visualize-ind_H1-captured.json';
import stamped from '../../../../tests/fixtures/api/visualize-3class-stamped.json';

/**
 * The analyses the /dev/fixtures ProbabilityBar cells show (04-18, DS-08). Real data only:
 *
 * - FIXTURE_ANALYSIS is the live analysis of the ind_H1 excerpt (id d5e62ea6-d107-44a5-a54f-c8ee87a0d204,
 *   recorded in docs/deploy/DEPLOY-LOG.md), read once and read-only from GET /visualize/{id} and kept
 *   to an allowlist of fields with no URL (see the `_capture` block in the JSON for the source and the
 *   capture time). Its probabilities are exactly as the API returned them.
 * - STAMPED_TEST_ANALYSIS is the committed 3-class test fixture. It is not a real analysis, and every
 *   cell that shows it says so.
 *
 * The JSON lives under tests/fixtures/api and is imported by relative path from this dev-only module,
 * which loads only inside the gated fixtures route, so the data is absent from every other bundle.
 */

export type AnalysisSource = 'captured' | 'test-fixture';

export interface FixtureAnalysis {
  /** The model's probabilities as stored, by class. */
  probabilities: Record<string, number>;
  /** The top class the API reported. */
  label: string;
  /** The contract site this recording belongs to, or the site the fixture's closest match names. */
  siteId: string;
  analysisId: string;
  source: AnalysisSource;
  /** The path, from the dashboard root, of the file the values come from (for the section's Data line). */
  file: string;
  /** What the cell says about where the reading came from. */
  note: string;
}

export const TEST_FIXTURE_NOTE = 'Test fixture, not a real analysis.';

/** "2026-10-05" from an ISO timestamp. */
function captureDate(capturedAt: string): string {
  return capturedAt.slice(0, 10);
}

export const FIXTURE_ANALYSIS: FixtureAnalysis = {
  probabilities: captured.classification.probabilities,
  label: captured.classification.label,
  siteId: 'ind_H1',
  analysisId: captured.analysis_id,
  source: 'captured',
  file: 'tests/fixtures/api/visualize-ind_H1-captured.json',
  note: `One-time read-only capture of the live analysis, ${captureDate(captured._capture.captured_at)}.`,
};

export const STAMPED_TEST_ANALYSIS: FixtureAnalysis = {
  probabilities: stamped.classification.probabilities,
  label: stamped.classification.label,
  // The fixture's closest reference site (first of its similar_sites), a real contract site.
  siteId: stamped.similar_sites[0].site_id,
  analysisId: stamped.analysis_id,
  source: 'test-fixture',
  file: 'tests/fixtures/api/visualize-3class-stamped.json',
  note: TEST_FIXTURE_NOTE,
};
