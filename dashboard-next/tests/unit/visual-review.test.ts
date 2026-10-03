// @vitest-environment node
/**
 * Proof for the before/after review page generator (03-14, PLAT-01, DS-07).
 *
 * Runs scripts/build-visual-review.mjs as a child process over temp directories.
 * Small byte buffers stand in for PNGs (the script hashes bytes, it never decodes
 * images). The git path is exercised against a throwaway repository, never the
 * real one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'scripts', 'build-visual-review.mjs');
const MD_NAME = 'PHASE-3-VISUAL-REVIEW.md';
const PAGE_DIR = 'phase-3-visual-review';

let tmp: string;

function mk(rel: string): string {
  const dir = path.join(tmp, rel);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function snap(state: string, width: number): string {
  return `${state}-${width}-visual-linux.png`;
}

function writeSet(dir: string, entries: Record<string, string>): void {
  for (const [name, content] of Object.entries(entries)) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(content));
  }
}

/** Three states at one width; `sites` differs between before and after. */
function threeStates(): { before: string; after: string; out: string } {
  const before = mk('before');
  const after = mk('after');
  const out = mk('out');
  writeSet(before, {
    [snap('landing', 1440)]: 'landing-same',
    [snap('about', 1440)]: 'about-same',
    [snap('sites', 1440)]: 'sites-old',
  });
  writeSet(after, {
    [snap('landing', 1440)]: 'landing-same',
    [snap('about', 1440)]: 'about-same',
    [snap('sites', 1440)]: 'sites-new',
  });
  return { before, after, out };
}

function writeCauses(causes: Record<string, string>): string {
  const file = path.join(tmp, 'causes.json');
  fs.writeFileSync(file, JSON.stringify(causes));
  return file;
}

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tableRows(md: string): string[][] {
  return md
    .split(/\r?\n/)
    .filter((l) => /^\| \S+ \| \d+ \| /.test(l))
    .map((l) =>
      l
        .replace(/^\| /, '')
        .replace(/ \|$/, '')
        .split(' | ')
    );
}

function listDir(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-review-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('build-visual-review: statuses and gating', () => {
  it('writes one row per state and width with identical/identical/changed and a pending decision', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'MapLibre controls replace Leaflet zoom buttons' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status, r.stderr).toBe(0);

    const md = fs.readFileSync(path.join(out, MD_NAME), 'utf-8');
    const rows = tableRows(md);
    expect(rows).toHaveLength(3);
    const byState = Object.fromEntries(rows.map((c) => [c[0], c]));
    expect(byState.landing[2]).toBe('identical');
    expect(byState.about[2]).toBe('identical');
    expect(byState.sites[2]).toBe('changed');
    expect(byState.sites[3]).toBe('MapLibre controls replace Leaflet zoom buttons');
    expect(byState.sites[4]).toBe('pending');
  });

  it('refuses with exit 1 naming the unexplained state when a changed row has no cause, and writes nothing', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ landing: 'not the changed one' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sites');
    expect(listDir(out)).toEqual([]);
  });

  it('refuses with exit 1 when no causes file is given and a row changed', () => {
    const { before, after, out } = threeStates();
    const r = run(['--before-dir', before, '--after-dir', after, '--out', out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sites');
  });

  it('reports added and missing states and demands a cause for them too', () => {
    const before = mk('before');
    const after = mk('after');
    const out = mk('out');
    writeSet(before, { [snap('gone', 1440)]: 'gone' });
    writeSet(after, { [snap('fresh', 1440)]: 'fresh' });
    const causes = writeCauses({ gone: 'removed on purpose', fresh: 'new state' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const rows = tableRows(fs.readFileSync(path.join(out, MD_NAME), 'utf-8'));
    const byState = Object.fromEntries(rows.map((c) => [c[0], c[2]]));
    expect(byState).toEqual({ fresh: 'added', gone: 'missing' });
  });
});

describe('build-visual-review: HTML page and copied images', () => {
  it('contains the difference blend, escapes every inserted string, and has no script element', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: '<script>alert(1)</script> & "quoted"' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const html = fs.readFileSync(path.join(out, PAGE_DIR, 'index.html'), 'utf-8');
    expect(html).toContain('mix-blend-mode: difference');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;');
  });

  it('copies images only for the changed state', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(listDir(path.join(out, PAGE_DIR, 'before'))).toEqual([snap('sites', 1440)]);
    expect(listDir(path.join(out, PAGE_DIR, 'after'))).toEqual([snap('sites', 1440)]);
    expect(fs.readFileSync(path.join(out, PAGE_DIR, 'before', snap('sites', 1440)), 'utf-8')).toBe('sites-old');
    expect(fs.readFileSync(path.join(out, PAGE_DIR, 'after', snap('sites', 1440)), 'utf-8')).toBe('sites-new');
  });
});

describe('build-visual-review: owner decisions survive regeneration', () => {
  it('keeps accepted on a changed row and the sign-off section when re-run', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    const args = ['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out];
    expect(run(args).status).toBe(0);

    const mdPath = path.join(out, MD_NAME);
    let md = fs.readFileSync(mdPath, 'utf-8');
    md = md.replace(/^(\| sites \| 1440 \| changed \| .* \| )pending( \|)$/m, '$1accepted$2');
    md = md.replace(/## Owner sign-off[\s\S]*$/, '## Owner sign-off\n\nAccepted by the owner on 2026-10-10: looks right.\n');
    fs.writeFileSync(mdPath, md);

    const r = run(args);
    expect(r.status, r.stderr).toBe(0);
    const again = fs.readFileSync(mdPath, 'utf-8');
    const sites = tableRows(again).find((c) => c[0] === 'sites');
    expect(sites?.[4]).toBe('accepted');
    expect(again).toContain('Accepted by the owner on 2026-10-10: looks right.');
  });

  it('resets a preserved decision to pending when the row status changes underneath it', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    const args = ['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out];
    expect(run(args).status).toBe(0);
    const mdPath = path.join(out, MD_NAME);
    fs.writeFileSync(
      mdPath,
      fs.readFileSync(mdPath, 'utf-8').replace(/^(\| sites \| 1440 \| changed \| .* \| )pending( \|)$/m, '$1accepted$2')
    );
    // The row becomes a different kind of difference: the owner accepted something else.
    fs.rmSync(path.join(after, snap('sites', 1440)));
    const r = run(args);
    expect(r.status, r.stderr).toBe(0);
    const sites = tableRows(fs.readFileSync(mdPath, 'utf-8')).find((c) => c[0] === 'sites');
    expect(sites?.[2]).toBe('missing');
    expect(sites?.[4]).toBe('pending');
  });
});

describe('build-visual-review: --check', () => {
  it('exits 0 on the matching markdown, writes nothing, and exits 1 after an after-image is altered', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    const base = ['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out];
    expect(run(base).status).toBe(0);

    const snapshot = (): string =>
      [MD_NAME, path.join(PAGE_DIR, 'index.html')]
        .map((f) => fs.readFileSync(path.join(out, f), 'utf-8'))
        .join('\n') +
      listDir(path.join(out, PAGE_DIR, 'before')).join(',') +
      listDir(path.join(out, PAGE_DIR, 'after')).join(',');
    const sizeBefore = snapshot();

    const ok = run([...base, '--check']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(snapshot()).toBe(sizeBefore);

    writeSet(after, { [snap('about', 1440)]: 'about-altered' });
    const bad = run([...base, '--check']);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('about');
    // And nothing was written by the failing check either.
    expect(snapshot()).toBe(sizeBefore);
  });

  it('exits 1 when a changed row has no cause in the causes file', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    expect(run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out]).status).toBe(0);
    const empty = writeCauses({});
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', empty, '--out', out, '--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sites');
  });

  it('exits 1 when the markdown does not exist', () => {
    const { before, after, out } = threeStates();
    const causes = writeCauses({ sites: 'changed' });
    const r = run(['--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out, '--check']);
    expect(r.status).toBe(1);
  });
});

describe('build-visual-review: unhidden review captures', () => {
  it('adds a "Map and canvas changes" section listing each capture and copies the images', () => {
    const { before, after, out } = threeStates();
    const rb = mk('review-before');
    const ra = mk('review-after');
    writeSet(rb, { 'landing.png': 'l-before', 'map.png': 'm-before' });
    writeSet(ra, { 'landing.png': 'l-after', 'map.png': 'm-after' });
    fs.writeFileSync(
      path.join(rb, 'meta.json'),
      JSON.stringify([
        { state: 'landing', webgl2: true, engines: [] },
        { state: 'map', webgl2: true, engines: ['maplibre'] },
      ])
    );
    fs.writeFileSync(
      path.join(ra, 'meta.json'),
      JSON.stringify([
        { state: 'landing', webgl2: true, engines: [] },
        { state: 'map', webgl2: false, engines: [] },
      ])
    );
    const causes = writeCauses({ sites: 'changed' });
    const r = run([
      '--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out,
      '--review-before', rb, '--review-after', ra, '--run-url', 'https://example.invalid/run/1',
    ]);
    expect(r.status, r.stderr).toBe(0);

    const md = fs.readFileSync(path.join(out, MD_NAME), 'utf-8');
    expect(md).toContain('## Map and canvas changes');
    expect(md).toContain('https://example.invalid/run/1');
    const section = md.slice(md.indexOf('## Map and canvas changes'));
    expect(section).toContain('| landing |');
    expect(section).toContain('| map |');
    expect(section).toMatch(/\| map \|.*maplibre.*\| pending \|/);

    const html = fs.readFileSync(path.join(out, PAGE_DIR, 'index.html'), 'utf-8');
    expect(html).toContain('Map and canvas changes');
    expect(listDir(path.join(out, PAGE_DIR, 'before'))).toEqual(
      ['review-landing.png', 'review-map.png', snap('sites', 1440)].sort()
    );
    expect(listDir(path.join(out, PAGE_DIR, 'after'))).toEqual(
      ['review-landing.png', 'review-map.png', snap('sites', 1440)].sort()
    );
  });

  it('keeps an accepted capture decision when re-run', () => {
    const { before, after, out } = threeStates();
    const rb = mk('review-before');
    const ra = mk('review-after');
    writeSet(rb, { 'map.png': 'm-before' });
    writeSet(ra, { 'map.png': 'm-after' });
    const causes = writeCauses({ sites: 'changed' });
    const args = [
      '--before-dir', before, '--after-dir', after, '--causes', causes, '--out', out,
      '--review-before', rb, '--review-after', ra,
    ];
    expect(run(args).status).toBe(0);
    const mdPath = path.join(out, MD_NAME);
    fs.writeFileSync(mdPath, fs.readFileSync(mdPath, 'utf-8').replace(/^(\| map \| .*\| )pending( \|)$/m, '$1accepted$2'));
    expect(run(args).status).toBe(0);
    expect(fs.readFileSync(mdPath, 'utf-8')).toMatch(/^\| map \| .*\| accepted \|$/m);
  });
});

describe('build-visual-review: reading the before set from a git ref', () => {
  it('reads the baselines at a ref with git show', () => {
    const repo = mk('repo');
    const snapDir = path.join(repo, 'dashboard-next', 'tests', 'e2e', 'visual.spec.ts-snapshots');
    fs.mkdirSync(snapDir, { recursive: true });
    writeSet(snapDir, {
      [snap('landing', 1440)]: 'landing-v1',
      [snap('sites', 1440)]: 'sites-v1',
      [snap('sites', 390)]: 'sites-390-v1',
    });
    const git = (...a: string[]): void => {
      const r = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...a], {
        cwd: repo,
        encoding: 'utf-8',
      });
      expect(r.status, r.stderr).toBe(0);
    };
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'baselines');
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).stdout.trim();

    const after = mk('after');
    const out = mk('out');
    writeSet(after, {
      [snap('landing', 1440)]: 'landing-v1',
      [snap('sites', 1440)]: 'sites-v2',
      [snap('sites', 390)]: 'sites-390-v1',
    });
    const causes = writeCauses({ sites: 'changed' });
    const r = run(['--repo', repo, '--before-ref', sha, '--after-dir', after, '--causes', causes, '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const rows = tableRows(fs.readFileSync(path.join(out, MD_NAME), 'utf-8'));
    expect(rows.map((c) => `${c[0]}@${c[1]}=${c[2]}`)).toEqual([
      'landing@1440=identical',
      'sites@1440=changed',
      'sites@390=identical',
    ]);
    expect(fs.readFileSync(path.join(out, PAGE_DIR, 'before', snap('sites', 1440)), 'utf-8')).toBe('sites-v1');
    expect(fs.readFileSync(path.join(out, MD_NAME), 'utf-8')).toContain(sha);
  });

  it('rejects a ref that could be read as a git option', () => {
    const { after, out } = threeStates();
    const r = run(['--before-ref', '--output=/tmp/x', '--after-dir', after, '--out', out]);
    expect(r.status).toBe(1);
  });
});
