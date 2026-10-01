/**
 * TRUTH-07 gate: banned, unmeasured-claim phrases must never reappear in UI
 * source, UI data or served manifests.
 *
 * Scope: every ts / tsx / json file under dashboard-next/src, plus the served
 * compare manifest and the audio attribution file. Text is lower-cased and
 * scanned line by line; any BANNED phrase fails the test with file:line.
 *
 * Phrase lists live in this file on purpose: they are the regression lock for
 * the claims found in .planning/audit/PRODUCT-AUDIT.md (sections 0, 4.7, 4.8,
 * 4.9) and .planning/audit/DATA-MODEL.md section 6 ("Claims the UI must not
 * make"). The ALLOW list exempts legitimate NEGATIVE statements (for example
 * the About page's "what it cannot measure" list). An ALLOW entry that no
 * longer matches anything fails the test, so exemptions cannot go stale.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve(__dirname, '../..');
const SRC_ROOT = path.join(DASHBOARD_ROOT, 'src');

const EXTRA_FILES = [
  'public/audio/compare/manifest.json',
  'public/audio/ATTRIBUTION.md',
];

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.json']);

interface BannedPhrase {
  /** Lower-case substring to look for. */
  phrase: string;
  /** Why this claim is banned (audit reference). */
  why: string;
}

export const BANNED: BannedPhrase[] = [
  // Species and behaviour names used as claims (nothing in the pipeline measures them).
  { phrase: 'grouper', why: 'species claim; band energy cannot identify species (DATA-MODEL s6)' },
  { phrase: 'clownfish', why: 'species claim (DATA-MODEL s6)' },
  { phrase: 'damselfish', why: 'species claim (DATA-MODEL s6)' },
  { phrase: 'parrotfish', why: 'species/behaviour claim (DATA-MODEL s6)' },
  { phrase: 'territorial calls', why: 'behaviour claim not measured (AUDIT 0.8)' },
  { phrase: 'snapping shrimp', why: 'species claim attached to a frequency band (AUDIT 4.7)' },
  { phrase: 'grouper booms', why: 'species claim (AUDIT 0.8)' },
  // Condition claims no system component measures.
  { phrase: 'bleach', why: 'bleaching claim; not measured (DATA-MODEL s6)' },
  { phrase: 'coral cover', why: 'coral-cover/coverage claim; not measured (DATA-MODEL s6)' },
  { phrase: 'overfish', why: 'overfishing claim; not measured (DATA-MODEL s6)' },
  { phrase: 'two years into restoration', why: 'unmeasured restoration-time claim (AUDIT 0.8)' },
  { phrase: 'recovery in sound', why: 'cross-site "recovery" story (DATA-MODEL s6)' },
  { phrase: 'strikingly quiet', why: 'generalisation from a confounded pair (AUDIT 0.6)' },
  { phrase: 'markedly higher sound level', why: 'generalisation from a confounded pair (AUDIT 0.6)' },
  // Scripted pipeline phrases.
  { phrase: 'measuring fish chorus density', why: 'scripted claim the pipeline does not perform (AUDIT 4.7)' },
  { phrase: 'identifying snapping shrimp', why: 'scripted claim the pipeline does not perform (AUDIT 4.7)' },
  { phrase: 'comparing to 44 reference sites', why: 'stale hard-coded count (AUDIT 4.8)' },
  // Confidence-reduction sentence and multiplier language.
  { phrase: 'reduced by 40%', why: 'confidence-reduction sentence; multiplier removed (AUDIT 0.3)' },
  { phrase: 'confidence is reduced', why: 'confidence-reduction sentence; multiplier removed (AUDIT 0.3)' },
  { phrase: 'confidence reduced', why: 'confidence-reduction sentence; multiplier removed (AUDIT 0.3)' },
  { phrase: 'confidence adjustment', why: 'region no longer adjusts probabilities (D-12; REVIEW CR-01)' },
  { phrase: 'adjusts confidence', why: 'region no longer adjusts probabilities (D-12; REVIEW CR-01)' },
  // False processing claims.
  { phrase: 'real-time processing', why: 'false claim; analysis is asynchronous (AUDIT 4.8)' },
  { phrase: 'real time processing', why: 'false claim; analysis is asynchronous (AUDIT 4.8)' },
  // Accuracy without context.
  { phrase: '~90%', why: 'accuracy claim without context (DATA-MODEL s6)' },
  { phrase: '90% accura', why: 'accuracy claim without context (DATA-MODEL s6)' },
  { phrase: '90% test accuracy', why: 'accuracy claim without context (DATA-MODEL s6)' },
  // Chart and visual claims that do not show what they say.
  { phrase: 'acoustic embedding space', why: 'half-vector scatter title; chart removed (AUDIT 0.2a)' },
  { phrase: 'living spectrogram', why: 'decorative visual presented as data (AUDIT 4.7)' },
  { phrase: 'spectrogram in the background', why: 'background visual is not a spectrogram (AUDIT 4.7)' },
  // Health-diagnosis marketing phrasing.
  { phrase: 'ai-powered', why: 'AI-powered health analysis overstates a research tool (AUDIT 0)' },
  // Hard-coded counts that drift from the API.
  { phrase: '54 sites', why: 'hard-coded site count; derive from the API (AUDIT 4.8)' },
  { phrase: '44 reference sites', why: 'stale hard-coded count (AUDIT 4.8)' },
  { phrase: '5 countries', why: 'stale hard-coded count (AUDIT 4.8)' },
];

interface AllowEntry {
  /** Path relative to dashboard-next, forward slashes. */
  file: string;
  /** Must equal a BANNED phrase. */
  phrase: string;
  reason: string;
}

export const ALLOW: AllowEntry[] = [
  {
    file: 'src/app/about/page.tsx',
    phrase: 'bleach',
    reason: 'About page "What It Cannot Measure" list names bleaching as out of scope (a negative statement)',
  },
  {
    file: 'src/app/about/page.tsx',
    phrase: 'coral cover',
    reason: 'About page "What It Cannot Measure" list names coral coverage as out of scope (a negative statement)',
  },
];

interface Hit {
  file: string;
  line: number;
  phrase: string;
  why: string;
  text: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function rel(file: string): string {
  return path.relative(DASHBOARD_ROOT, file).split(path.sep).join('/');
}

function collectFiles(): string[] {
  const files: string[] = [];
  walk(SRC_ROOT, files);
  for (const extra of EXTRA_FILES) {
    const full = path.join(DASHBOARD_ROOT, extra);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

/** Scan text for banned phrases; pure so the scanner itself is testable. */
export function scanText(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.toLowerCase().split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const banned of BANNED) {
      if (line.includes(banned.phrase)) {
        hits.push({ file, line: idx + 1, phrase: banned.phrase, why: banned.why, text: line.trim().slice(0, 140) });
      }
    }
  });
  return hits;
}

function isAllowed(hit: Hit): boolean {
  return ALLOW.some((a) => a.file === hit.file && a.phrase === hit.phrase);
}

describe('banned-claims gate (TRUTH-07)', () => {
  it('scanner detects a banned phrase case-insensitively with a line number', () => {
    const hits = scanText('x.tsx', 'fine line\nA Bleached reef with GROUPER booms\n');
    expect(hits.map((h) => `${h.line}:${h.phrase}`)).toEqual(
      expect.arrayContaining(['2:bleach', '2:grouper']),
    );
  });

  it('scans a non-trivial number of files (guards against an empty scan)', () => {
    expect(collectFiles().length).toBeGreaterThan(40);
  });

  it('every ALLOW entry names a BANNED phrase', () => {
    const phrases = new Set(BANNED.map((b) => b.phrase));
    for (const a of ALLOW) {
      expect(phrases.has(a.phrase), `ALLOW phrase "${a.phrase}" is not in BANNED`).toBe(true);
      expect(a.reason.length).toBeGreaterThan(20);
    }
  });

  it('no banned phrase appears in UI source, UI data or served manifests', () => {
    const all: Hit[] = [];
    for (const file of collectFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      all.push(...scanText(rel(file), text));
    }
    const violations = all.filter((h) => !isAllowed(h));
    const report = violations
      .map((h) => `${h.file}:${h.line} banned "${h.phrase}" (${h.why}) -> ${h.text}`)
      .join('\n');
    expect(violations, `\n${report}\n`).toEqual([]);
  });

  it('no ALLOW entry is stale (each must still match something)', () => {
    const all: Hit[] = [];
    for (const file of collectFiles()) {
      all.push(...scanText(rel(file), fs.readFileSync(file, 'utf8')));
    }
    const stale = ALLOW.filter((a) => !all.some((h) => h.file === a.file && h.phrase === a.phrase));
    expect(stale, `stale ALLOW entries: ${JSON.stringify(stale)}`).toEqual([]);
  });
});
