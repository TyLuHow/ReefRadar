// @vitest-environment node
/**
 * Semantic-token scanner (04-04). "Components read semantic tokens only" (UI-SPEC "Semantic token
 * contract (binding)"): no file under the design-system feature folders may name a raw hex or
 * rgb()/hsl() colour, a font family, a pixel radius, or branch on the design direction. Values live
 * in src/styles/tokens.css; components use the Tailwind utilities generated from it or var(--...).
 *
 * `findRawValues` is a pure matcher so the rules can be proven against planted violations before the
 * real tree is scanned. Comments are blanked first (line numbers are kept): a comment may describe a
 * value, only code may not use one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DASHBOARD_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(DASHBOARD_ROOT, 'src');

const toPosix = (p: string) => p.split(path.sep).join('/');

/** Replaces block and line comments with spaces, keeping newlines so line numbers stay true. */
function blankComments(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

/**
 * Files exempt from a rule family, each with the reason.
 * - status-shapes.ts is the one status geometry module: it holds shape geometry, not colour or type,
 *   so the raw-value rules do not apply to it (it still may not branch on the direction).
 * - tokens.ts (the JS token bridge) observes the data-direction attribute so it re-reads tokens when it
 *   changes; it never branches on the value.
 * - FixturesApp.tsx and query.ts (the /dev/fixtures switcher) set or read the data-direction
 *   attribute; no component branches on it. Exempt from the direction rule only.
 */
const RAW_VALUE_EXEMPT = new Set(['src/features/ui/status-shapes.ts']);
const DIRECTION_EXEMPT = new Set(['src/features/ui/tokens.ts', 'src/features/fixtures/FixturesApp.tsx', 'src/features/fixtures/query.ts']);

interface Rule {
  name: string;
  pattern: RegExp;
  /** Return true when a match is acceptable (for example a var() reference). */
  allow?: (match: RegExpExecArray) => boolean;
}

const VAR_REFERENCE = /^\s*['"`]?\s*var\(\s*--/;

const RAW_VALUE_RULES: Rule[] = [
  {
    name: 'raw hex colour',
    // #rgb or #rrggbb after a quote, backtick, parenthesis, colon, comma or whitespace, and not part of
    // a longer word or a hyphenated name (so an anchor such as href="#dialog" is not a colour).
    pattern: /(?<=["'`(:,\s])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g,
  },
  { name: 'raw rgb/hsl colour literal', pattern: /\b(?:rgba?|hsla?|oklch|oklab|hwb)\(\s*[-\d.]/g },
  {
    name: 'raw font family',
    pattern: /\b(?:font-family\s*:|fontFamily\s*:)\s*([^;\n}]*)/g,
    allow: (m) => VAR_REFERENCE.test(m[1] ?? ''),
  },
  { name: 'raw radius', pattern: /\b(?:border-radius\s*:\s*|borderRadius\s*:\s*['"`]?)\d/g },
  { name: 'raw pixel radius utility', pattern: /\brounded(?:-[a-z]{1,2})?-\[[^\]]*px/g },
];

const DIRECTION_RULES: Rule[] = [
  { name: 'data-direction string', pattern: /data-direction/g },
  { name: 'comparison on a variable named direction', pattern: /(?<![.\w])direction\s*[=!]==?|[=!]==?\s*direction\b|\bswitch\s*\(\s*direction\s*\)/g },
  { name: 'comparison against a direction name', pattern: /[=!]==?\s*['"](?:atlas|nocturne|poster)['"]/g },
];

/** `path:line: rule: matched text` for every violation in `text` (file is a path relative to the dashboard root). */
export function findRawValues(text: string, file: string): string[] {
  const rel = toPosix(file);
  const code = blankComments(text);
  const rules = [...(RAW_VALUE_EXEMPT.has(rel) ? [] : RAW_VALUE_RULES), ...(DIRECTION_EXEMPT.has(rel) ? [] : DIRECTION_RULES)];
  const hits: string[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(code)) !== null) {
      if (rule.allow?.(m)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      hits.push(`${rel}:${line}: ${rule.name}: ${m[0].trim()}`);
    }
  }
  return hits;
}

describe('findRawValues: planted violations', () => {
  const planted: Array<[string, string]> = [
    ['a single-quoted six-digit hex', "const c = '#914615';"],
    ['a double-quoted three-digit hex', 'const c = "#fff";'],
    ['a hex in a template literal', 'const c = `1px solid #0d0f14`;'],
    ['a hex after a colon', 'a { color:#abcdef; }'],
    ['an rgb() literal', 'const c = rgb(1, 2, 3);'],
    ['an rgba() literal', 'const c = "rgba(0,0,0,0.5)";'],
    ['an hsl() literal', 'const c = hsl(10 20% 30%);'],
    ['a camelCase font family', "const s = { fontFamily: 'X' };"],
    ['a css font family', 'p { font-family: Georgia; }'],
    ['a css px radius', 'p { border-radius: 4px; }'],
    ['an arbitrary px radius utility', '<div className="rounded-[6px]" />'],
    ['a numeric borderRadius', 'const s = { borderRadius: 2 };'],
    ['a data-direction string', "el.setAttribute('data-direction', 'x');"],
    ['a comparison on direction', "if (direction === 'atlas') return 1;"],
    ['a switch on direction', 'switch (direction) { default: }'],
    ['a comparison against a direction name', "const a = d === 'nocturne';"],
  ];

  it.each(planted)('trips on %s', (_name, code) => {
    expect(findRawValues(code, 'src/features/ui/Probe.tsx').length).toBeGreaterThan(0);
  });

  const allowed: Array<[string, string]> = [
    ['an in-page anchor', '<a href="#dialog">Skip</a>'],
    ['an element id', '<div id="tokens" />'],
    ['a font family var() reference', "const s = { fontFamily: 'var(--dir-font-data)' };"],
    ['a css font family var() reference', 'p { font-family: var(--dir-font-body); }'],
    ['a display style var() reference', "const s = { fontStyle: 'var(--display-style)' };"],
    ['a radius var() reference', "const s = { borderRadius: 'var(--dir-radius-control)' };"],
    ['a hyphenated hash name', '<a href="#add-item">Add</a>'],
    ['a hex inside a comment', '// the ground is #FFFFFF in atlas\n/* #123456 */\nconst a = 1;'],
    ['a sort descriptor direction', "if (sortDescriptor.direction === 'ascending') return 1;"],
    ['a flex direction', "const s = { flexDirection: 'column' };"],
    ['a regular expression for hex', 'const HEX = /^#[0-9a-f]{6}$/i;'],
    ['a URL with a double slash', "const u = 'https://example.org/a'; const x = 1;"],
  ];

  it.each(allowed)('does not trip on %s', (_name, code) => {
    expect(findRawValues(code, 'src/features/ui/Probe.tsx')).toEqual([]);
  });

  it('reports the file, line and rule', () => {
    const hits = findRawValues("const a = 1;\nconst c = '#914615';\n", 'src/features/ui/Probe.tsx');
    expect(hits).toEqual(["src/features/ui/Probe.tsx:2: raw hex colour: #914615"]);
  });

  it('exempts the status geometry module from the raw-value rules and the switcher from the direction rule', () => {
    expect(findRawValues("const c = '#914615';", 'src/features/ui/status-shapes.ts')).toEqual([]);
    expect(findRawValues("if (direction === 'atlas') {}", 'src/features/ui/status-shapes.ts').length).toBeGreaterThan(0);
    expect(findRawValues("el.setAttribute('data-direction', d);", 'src/features/fixtures/FixturesApp.tsx')).toEqual([]);
    expect(findRawValues("const c = '#914615';", 'src/features/fixtures/FixturesApp.tsx').length).toBeGreaterThan(0);
  });
});

/** Directories and files the design-system code lives in; any that does not exist yet is skipped. */
const SCAN_DIRS = ['src/features/ui', 'src/features/instrument', 'src/features/fixtures', 'src/app/dev'];
const SCAN_FILES = [
  'src/features/charts/plot-theme.ts',
  'src/features/charts/StripPlot.tsx',
  'src/features/map/token-style.ts',
  'src/features/map/TokenProbeMap.tsx',
];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mjs', '.js']);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(path.extname(entry.name)) && !/\.(test|spec)\.[tj]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('semantic tokens: the real tree', () => {
  const files = [
    ...SCAN_DIRS.flatMap((d) => walk(path.join(DASHBOARD_ROOT, d))),
    ...SCAN_FILES.map((f) => path.join(DASHBOARD_ROOT, f)).filter((f) => fs.existsSync(f)),
  ];

  it('scans a non-empty set of files', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith(SRC))).toBe(true);
  });

  it('finds no raw colour, font family, pixel radius or direction branch', () => {
    const hits = files.flatMap((f) => findRawValues(fs.readFileSync(f, 'utf8'), toPosix(path.relative(DASHBOARD_ROOT, f))));
    expect(hits, `\n${hits.join('\n')}\n`).toEqual([]);
  });
});
