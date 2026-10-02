// @vitest-environment node
/**
 * Proof that the feature fence works (PLAT-03, 03-05): legacy component imports
 * planted inside src/features/** fail both ESLint and the CI grep script, the
 * allowed imports (a feature's own ./components, @/lib, @/types, the contract
 * barrel, anything outside src/features) pass, and the real tree is clean.
 *
 * Node environment: ESLint and child_process need Node, not jsdom.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.resolve(DASHBOARD_ROOT, '..', 'scripts', 'check-feature-fence.mjs');

// eslint ships no type declarations here (no @types/eslint); type only what the test uses.
interface LintMessage {
  ruleId: string | null;
}
interface LintResult {
  messages: LintMessage[];
}
interface EslintLike {
  lintText(code: string, options: { filePath: string }): Promise<LintResult[]>;
}
const { ESLint } = require('eslint') as { ESLint: new (options: { cwd: string }) => EslintLike };

const FENCE_RULES = ['no-restricted-syntax', 'no-restricted-imports'];

let eslint: EslintLike;

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId && FENCE_RULES.includes(m.ruleId)).map((m) => m.ruleId as string);
}

const FEATURE_FILE = 'src/features/map/fence-probe.tsx';
const CONTRACT_FILE = 'src/features/contract/fence-probe.ts';

const BLOCKED: Array<{ name: string; code: string; filePath: string; rule: string }> = [
  {
    name: 'a static import from @/components/Navbar in a feature',
    code: "import { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-imports',
  },
  {
    name: 'a bare import from @/components in a feature',
    code: "import { Navbar } from '@/components';\nexport const n = Navbar;\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-imports',
  },
  {
    name: 'an export-from @/components/map/HealthLegend in a feature',
    code: "export { HealthLegend } from '@/components/map/HealthLegend';\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-imports',
  },
  {
    name: "a dynamic import('@/components/Navbar') in a feature",
    code: "export const load = () => import('@/components/Navbar');\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-syntax',
  },
  {
    name: 'a static import from @/components/Navbar inside the contract module',
    code: "import { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n",
    filePath: CONTRACT_FILE,
    rule: 'no-restricted-imports',
  },
  {
    name: "a dynamic import('@/components/Navbar') inside the contract module",
    code: "export const load = () => import('@/components/Navbar');\n",
    filePath: CONTRACT_FILE,
    rule: 'no-restricted-syntax',
  },
  {
    // The contract deep-import rule must survive the per-block rule replacement.
    name: 'a deep contract import from a non-contract feature (contract rule survived)',
    code: "import { loadManifest } from '@/features/contract/client';\nexport const m = loadManifest;\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-imports',
  },
  {
    // The contract selectors must survive too (no-restricted-syntax is replaced in the features block).
    name: 'a contract URL string literal in a non-contract feature (contract selectors survived)',
    code: "export const u = 'https://d111111abcdef8.cloudfront.net/contract/latest.json';\n",
    filePath: FEATURE_FILE,
    rule: 'no-restricted-syntax',
  },
];

const ALLOWED: Array<{ name: string; code: string; filePath: string }> = [
  {
    name: "a feature's own ./components/Local import",
    code: "import { Local } from './components/Local';\nexport const l = Local;\n",
    filePath: FEATURE_FILE,
  },
  {
    name: '@/lib/api from a feature',
    code: "import { api } from '@/lib/api';\nexport const a = api;\n",
    filePath: FEATURE_FILE,
  },
  {
    name: '@/types from a feature',
    code: "import type { ReefStatus } from '@/types';\nexport type S = ReefStatus;\n",
    filePath: FEATURE_FILE,
  },
  {
    name: 'the contract barrel from a feature',
    code: "import { useContract } from '@/features/contract';\nexport const h = useContract;\n",
    filePath: FEATURE_FILE,
  },
  {
    name: 'a dynamic import of a feature-local module',
    code: "export const load = () => import('./components/Local');\n",
    filePath: FEATURE_FILE,
  },
  {
    name: '@/components/Navbar from src/app',
    code: "import { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n",
    filePath: 'src/app/fence-probe.tsx',
  },
  {
    name: '@/components/Navbar from src/components',
    code: "import { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n",
    filePath: 'src/components/fence-probe.tsx',
  },
];

describe('ESLint feature fence', () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: DASHBOARD_ROOT });
  });

  it.each(BLOCKED)('fails: $name', async ({ code, filePath, rule }) => {
    expect(await ruleIds(code, filePath)).toContain(rule);
  }, 60_000);

  it.each(ALLOWED)('passes: $name', async ({ code, filePath }) => {
    expect(await ruleIds(code, filePath)).toEqual([]);
  }, 60_000);
});

describe('grep feature fence', () => {
  let tmp: string;
  let counter = 0;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-fence-'));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Build a temporary src tree from a map of relative path -> source text. */
  function makeTree(files: Record<string, string>): string {
    counter += 1;
    const root = path.join(tmp, `tree-${counter}`);
    for (const [rel, code] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, code);
    }
    return root;
  }

  function run(root?: string) {
    const args = root ? [SCRIPT, '--root', root] : [SCRIPT];
    return spawnSync(process.execPath, args, { encoding: 'utf-8' });
  }

  it('passes on the repository tree', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
    expect(out).toMatch(/^OK:/);
  });

  // Line 1 is a comment so every planted specifier sits on line 2.
  const PLANTED: Array<{ name: string; file: string; code: string }> = [
    { name: 'a static import', file: 'features/x/a.ts', code: "import { Navbar } from '@/components/Navbar';\n" },
    { name: 'a bare @/components import', file: 'features/x/a.ts', code: "import { Navbar } from '@/components';\n" },
    { name: 'a side-effect import', file: 'features/x/a.ts', code: "import '@/components/Navbar';\n" },
    { name: 'an export-from', file: 'features/x/a.ts', code: "export { HealthLegend } from '@/components/map/HealthLegend';\n" },
    { name: 'a dynamic import', file: 'features/x/a.ts', code: "export const load = () => import('@/components/Navbar');\n" },
    { name: 'a require', file: 'features/x/a.ts', code: "const nav = require('@/components/Navbar');\n" },
    {
      name: 'a relative path into src/components from a nested feature file',
      file: 'features/x/y/z.ts',
      code: "import { Navbar } from '../../../components/Navbar';\n",
    },
    {
      name: 'a multi-line import (reported on the from line)',
      file: 'features/x/a.ts',
      code: "import {\n  Navbar,\n} from '@/components/Navbar';\n",
    },
  ];

  it.each(PLANTED)('fails with file:line on $name', ({ file, code }) => {
    const root = makeTree({ [file]: `// line one\n${code}` });
    const result = run(root);
    expect(result.status).toBe(1);
    // A multi-line import reports the line carrying the specifier (the last line of the statement).
    const expectedLine = 1 + code.trimEnd().split('\n').length;
    expect(result.stderr).toContain(`${file}:${expectedLine}: legacy component import`);
    expect(result.stderr).toContain('FAIL: 1 hit(s)');
  });

  it('allows a feature-local ../../components/Local that resolves under src/features', () => {
    // features/x/y -> ../../ is src/features, so this is src/features/components, not src/components.
    const root = makeTree({
      'features/x/y/z.ts': "import { Local } from '../../components/Local';\nexport const l = Local;\n",
      'features/components/Local.tsx': 'export const Local = 1;\n',
    });
    expect(run(root).status).toBe(0);
  });

  it("allows a feature's own ./components/Local, @/lib, @/types and the contract barrel", () => {
    const root = makeTree({
      'features/map/index.ts': [
        "import { Local } from './components/Local';",
        "import { api } from '@/lib/api';",
        "import type { ReefStatus } from '@/types';",
        "import { useContract } from '@/features/contract';",
        'export const all = [Local, api, useContract];',
        'export type S = ReefStatus;',
        '',
      ].join('\n'),
      'features/map/components/Local.tsx': 'export const Local = 1;\n',
    });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^OK:/);
  });

  it('allows @/components imports under app/ and inside the legacy components themselves', () => {
    const root = makeTree({
      'app/page.tsx': "import { Navbar } from '@/components/Navbar';\nexport default Navbar;\n",
      'components/Shell.tsx': "import { Navbar } from '@/components/Navbar';\nexport const S = Navbar;\n",
      'components/Navbar.tsx': 'export const Navbar = 1;\n',
      'features/x/a.ts': 'export const x = 1;\n',
    });
    expect(run(root).status).toBe(0);
  });

  it('ignores a legacy import that only appears in a comment', () => {
    const root = makeTree({
      'features/x/a.ts': "// import { Navbar } from '@/components/Navbar';\n/* import('@/components/Navbar') */\nexport const x = 1;\n",
    });
    expect(run(root).status).toBe(0);
  });

  it('passes when the tree has no features directory', () => {
    const root = makeTree({ 'app/page.tsx': 'export default 1;\n' });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 file(s) scanned');
  });
});
