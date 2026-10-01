#!/usr/bin/env node
// scripts/check-citations.mjs
//
// Canonical citations checker for ReefRadar (TRUTH-08 / D-19).
//
// Node built-ins only (fs, path, child_process, url) — no npm dependency.
//
// Modes:
//   (no flags)         Schema check + compare generated docs/CITATIONS.md
//                       against the file on disk. Exits 1 if they differ
//                       (same behaviour as --check-md).
//   --check-md         Same as the default mode, explicit.
//   --write-md         Schema check, then render docs/CITATIONS.md and
//                       overwrite the file on disk.
//   --scope docs|all   Schema check, then scan git-tracked text files for
//                       banned (known-wrong) citation patterns.
//                       docs: excludes .planning/, prompts/, dashboard-next/src/,
//                             dashboard-next/tests/baseline/, node_modules and
//                             lockfiles.
//                       all:  docs scope + dashboard-next/src/.
//   --paths <files...> Restrict the --scope scan to exactly these files
//                       (still schema-checks citations.json first).
//
// Exit code 0 on success, 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CITATIONS_JSON_PATH = path.join(REPO_ROOT, 'dashboard-next', 'src', 'data', 'citations.json');
const CITATIONS_MD_PATH = path.join(REPO_ROOT, 'docs', 'CITATIONS.md');

const EXPECTED_IDS = ['marrs', 'surfperch', 'irma', 'coralsoundexplorer', 'sanctsound'];
const REQUIRED_FIELDS = ['id', 'title', 'authors', 'year', 'licence'];

// --- Banned patterns -------------------------------------------------------
// Each entry: { pattern: RegExp, reason: string }
// Patterns are matched per-line against git-tracked text files.
const BANNED_PATTERNS = [
  {
    pattern: /Sherwen,?\s*K\.?/,
    reason: 'Wrong MARRS author "Sherwen, K." — real registered authors are Williams, B. and Jones, K. (DATA-MODEL.md 5.1)',
  },
  {
    pattern: /Maynes,?\s*T\.?.{0,40}Sherwood,?\s*O\.?/,
    reason: 'Wrong MARRS co-authors "Maynes, T., Sherwood, O." — not in the figshare or bioRxiv author lists (DATA-MODEL.md 5.1)',
  },
  {
    pattern: /\b6024203\b/,
    reason: 'Wrong MARRS credit link — zenodo.org/records/6024203 is an unrelated scale-insect taxonomy record, not MARRS (DATA-MODEL.md 5.1)',
  },
  {
    pattern: /\b2505\.03071\b/,
    reason: 'Wrong SurfPerch arXiv id — 2505.03071 is a different paper ("The Search for Squawk", Dumoulin et al. 2025); the correct SurfPerch paper is arXiv 2404.16436 (DATA-MODEL.md 5.5)',
  },
  {
    pattern: /dryad\.sxksn0319/i,
    reason: 'Superseded Irma Hurricane Dryad DOI (10.5061/dryad.sxksn0319, from prompts/049) — the correct, currently-registered DOI is 10.5061/dryad.5tb2rbp38',
  },
  {
    pattern: /Monitoring And Restoration of Reef Soundscapes/i,
    reason: 'Wrong MARRS acronym expansion — MARRS stands for "Mars Assisted Reef Restoration System", not "Monitoring And Restoration of Reef Soundscapes"',
  },
  {
    pattern: /bird-vocalization-classifier/i,
    reason: 'SurfPerch described as a bird classifier — it is pre-trained on reef, bird and general audio (arXiv 2404.16436), not a bird-only classifier',
  },
  {
    pattern: /\bMARRS\b.{0,80}\b2024\b|\b2024\b.{0,80}\bMARRS\b/,
    reason: 'MARRS cited with year 2024 on the same line — the canonical MARRS dataset was published 2025-09-24; 2024 is not a valid MARRS publication year',
  },
];

// --- Scope exclusions for --scope docs -------------------------------------
const DOCS_SCOPE_EXCLUDE_DIRS = [
  '.planning/',
  'prompts/',
  'dashboard-next/src/',
  // Frozen pre-redesign regression baseline (D-20, TRUTH-10): screenshots,
  // axe reports and route captures taken verbatim from the live production
  // deployment at a point in time. Referenced, never regenerated — it is
  // historical evidence of what WAS live (including its citation errors),
  // not live documentation this checker should hold to current standards.
  'dashboard-next/tests/baseline/',
  'node_modules/',
];
const LOCKFILE_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
// This checker's own source necessarily contains the banned substrings as
// pattern *definitions* (BANNED_PATTERNS above) — exclude it from the scan
// it performs, or it would flag itself.
const SELF_FILE = 'scripts/check-citations.mjs';
// Binary / non-text extensions that should never be grepped as citation text.
const BINARY_EXTENSIONS = new Set([
  '.wav', '.mp3', '.flac', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ico', '.pdf', '.npz', '.npy', '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mov', '.pyc', '.so', '.dll', '.exe',
]);

function parseArgs(argv) {
  const args = { writeMd: false, checkMd: false, scope: null, paths: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write-md') args.writeMd = true;
    else if (a === '--check-md') args.checkMd = true;
    else if (a === '--scope') {
      args.scope = argv[++i];
      if (args.scope !== 'docs' && args.scope !== 'all') {
        throw new Error(`--scope must be "docs" or "all", got "${args.scope}"`);
      }
    } else if (a === '--paths') {
      args.paths = [];
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.paths.push(argv[++i]);
      }
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function loadCitations() {
  if (!fs.existsSync(CITATIONS_JSON_PATH)) {
    throw new Error(`Missing canonical citations file: ${path.relative(REPO_ROOT, CITATIONS_JSON_PATH)}`);
  }
  const raw = fs.readFileSync(CITATIONS_JSON_PATH, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`citations.json is not valid JSON: ${err.message}`);
  }
  return data;
}

function validateSchema(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('citations.json root must be an object');
    return errors;
  }
  if (!data.citations || typeof data.citations !== 'object') {
    errors.push('citations.json must have a top-level "citations" object');
    return errors;
  }

  for (const id of EXPECTED_IDS) {
    if (!(id in data.citations)) {
      errors.push(`citations.json is missing required record "${id}"`);
    }
  }

  for (const [key, record] of Object.entries(data.citations)) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in record) || record[field] === undefined) {
        errors.push(`citations["${key}"] is missing required field "${field}"`);
        continue;
      }
      if (field === 'authors') {
        if (!Array.isArray(record.authors) || record.authors.length === 0 || !record.authors.every((a) => typeof a === 'string' && a.length > 0)) {
          errors.push(`citations["${key}"].authors must be a non-empty array of non-empty strings`);
        }
      } else if (field === 'title' || field === 'id') {
        if (typeof record[field] !== 'string' || record[field].length === 0) {
          errors.push(`citations["${key}"].${field} must be a non-empty string`);
        }
      } else if (field === 'licence') {
        if (typeof record.licence !== 'string' || record.licence.length === 0) {
          errors.push(`citations["${key}"].licence must be a non-empty string`);
        }
      }
      // year may legitimately be null (e.g. an ongoing multi-year project);
      // presence of the key is what's required, not non-nullness.
    }
    if (!record.doi && !record.url) {
      errors.push(`citations["${key}"] must have a doi or a url`);
    }
    if (record.doi !== null && record.doi !== undefined && typeof record.doi !== 'string') {
      errors.push(`citations["${key}"].doi must be a string or null`);
    }
    if (record.url !== undefined && typeof record.url !== 'string') {
      errors.push(`citations["${key}"].url must be a string`);
    }
  }

  return errors;
}

// --- citations.ts-equivalent formatting (kept in sync manually; citations.ts
// is the source of truth for the app, this is only for deterministic MD render) --
function formatShort(record) {
  return record.short;
}

function formatApa(record) {
  const authors = record.authors.join(', ');
  const year = record.year ?? 'n.d.';
  const link = record.doi ? `https://doi.org/${record.doi}` : record.url;
  return `${authors} (${year}). ${record.title}. ${record.publisher}. ${link}`;
}

// --- Markdown render ---------------------------------------------------
function renderMarkdown(data) {
  const lines = [];
  lines.push('<!-- GENERATED FILE — do not hand-edit. -->');
  lines.push('<!-- Source: dashboard-next/src/data/citations.json -->');
  lines.push('<!-- Regenerate with: node scripts/check-citations.mjs --write-md -->');
  lines.push('');
  lines.push('# Canonical Citations');
  lines.push('');
  lines.push(`Verified at: ${data.verified_at}`);
  lines.push('');
  lines.push('This is the single canonical source for every dataset and model-paper citation used anywhere in ReefRadar. All other repository documentation and UI surfaces must match these records.');
  lines.push('');

  for (const id of EXPECTED_IDS) {
    const record = data.citations[id];
    if (!record) continue;
    lines.push(`## ${record.title}`);
    lines.push('');
    lines.push(`- **Id:** \`${record.id}\``);
    lines.push(`- **Kind:** ${record.kind}`);
    lines.push(`- **Authors:** ${record.authors.join(', ')}`);
    lines.push(`- **Year:** ${record.year ?? 'n.d.'}`);
    lines.push(`- **Publisher:** ${record.publisher}`);
    if (record.doi) lines.push(`- **DOI:** [${record.doi}](https://doi.org/${record.doi})`);
    lines.push(`- **URL:** ${record.url}`);
    lines.push(`- **Licence:** ${record.licence}${record.licence_url ? ` (${record.licence_url})` : ''}`);
    lines.push(`- **Short citation:** ${formatShort(record)}`);
    lines.push(`- **APA:** ${formatApa(record)}`);
    if (record.related && record.related.length > 0) {
      lines.push('- **Related:**');
      for (const rel of record.related) {
        const relLink = rel.doi ? `https://doi.org/${rel.doi}` : rel.url;
        lines.push(`  - ${rel.label}: ${relLink}`);
      }
    }
    lines.push(`- **Verified from:** ${record.verified_from}`);
    if (record.verification_note) {
      lines.push(`- **Verification note:** ${record.verification_note}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Scope and exclusions');
  lines.push('');
  lines.push('The citation checker (`scripts/check-citations.mjs --scope docs`) scans every git-tracked text file for known-wrong citation patterns, excluding `.planning/`, `prompts/`, `dashboard-next/src/`, `dashboard-next/tests/baseline/`, `node_modules/`, lockfiles, and its own source file (which legitimately contains the banned substrings as pattern definitions). `prompts/` holds historical task logs and is excluded by design — those files describe past (sometimes since-corrected) planning intent and are not live product documentation. `dashboard-next/tests/baseline/` is a frozen pre-redesign regression baseline (D-20) captured verbatim from the live deployment and is never regenerated, so it legitimately preserves whatever citation errors were live at capture time. `dashboard-next/src/` is included only at `--scope all`, run once the UI consumes this module directly (Phase 1 plans 01-17/01-18/01-19).');
  lines.push('');

  return lines.join('\n') + '\n';
}

function checkMd(data) {
  const rendered = renderMarkdown(data);
  if (!fs.existsSync(CITATIONS_MD_PATH)) {
    console.error(`FAIL: ${path.relative(REPO_ROOT, CITATIONS_MD_PATH)} does not exist. Run with --write-md first.`);
    return false;
  }
  const onDisk = fs.readFileSync(CITATIONS_MD_PATH, 'utf8');
  if (onDisk !== rendered) {
    console.error(`FAIL: ${path.relative(REPO_ROOT, CITATIONS_MD_PATH)} is out of date with citations.json. Run with --write-md to regenerate.`);
    return false;
  }
  console.log(`OK: ${path.relative(REPO_ROOT, CITATIONS_MD_PATH)} matches citations.json.`);
  return true;
}

function writeMd(data) {
  const rendered = renderMarkdown(data);
  fs.mkdirSync(path.dirname(CITATIONS_MD_PATH), { recursive: true });
  fs.writeFileSync(CITATIONS_MD_PATH, rendered, 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, CITATIONS_MD_PATH)}`);
}

// --- Scope scan ----------------------------------------------------------
function gitLsFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function isExcludedByDocsScope(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized === SELF_FILE) return true;
  if (DOCS_SCOPE_EXCLUDE_DIRS.some((dir) => normalized.startsWith(dir))) return true;
  const base = path.basename(normalized);
  if (LOCKFILE_NAMES.has(base)) return true;
  return false;
}

function isBinaryFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function resolveScopeFiles(scope, explicitPaths) {
  if (explicitPaths && explicitPaths.length > 0) {
    return explicitPaths;
  }
  const allTracked = gitLsFiles();
  if (scope === 'all') {
    return allTracked.filter((f) => !isExcludedByDocsScope(f) || f.replace(/\\/g, '/').startsWith('dashboard-next/src/'));
  }
  // scope === 'docs'
  return allTracked.filter((f) => !isExcludedByDocsScope(f));
}

function scanScope(scope, explicitPaths) {
  const files = resolveScopeFiles(scope, explicitPaths).filter((f) => !isBinaryFile(f));
  let hits = 0;

  for (const relFile of files) {
    const absFile = path.join(REPO_ROOT, relFile);
    if (!fs.existsSync(absFile)) continue; // may be --paths entry not yet created
    let content;
    try {
      content = fs.readFileSync(absFile, 'utf8');
    } catch {
      continue; // skip unreadable/binary files defensively
    }
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const { pattern, reason } of BANNED_PATTERNS) {
        if (pattern.test(line)) {
          console.error(`${relFile}:${idx + 1}: ${reason}`);
          hits++;
        }
      }
    });
  }

  if (hits > 0) {
    console.error(`FAIL: ${hits} banned-pattern hit(s) found at --scope ${scope}.`);
    return false;
  }
  console.log(`OK: no banned-pattern hits at --scope ${scope} (${files.length} file(s) scanned).`);
  return true;
}

// --- Main ------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));

  let data;
  try {
    data = loadCitations();
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }

  const schemaErrors = validateSchema(data);
  if (schemaErrors.length > 0) {
    console.error('FAIL: citations.json schema errors:');
    for (const e of schemaErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('OK: citations.json schema is valid.');

  let ok = true;

  if (args.scope) {
    ok = scanScope(args.scope, args.paths) && ok;
  }

  if (args.writeMd) {
    writeMd(data);
  } else if (args.checkMd || !args.scope) {
    // Default mode (no flags at all) behaves like --check-md.
    ok = checkMd(data) && ok;
  }

  process.exit(ok ? 0 : 1);
}

main();
