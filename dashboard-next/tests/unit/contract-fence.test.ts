// @vitest-environment node
/**
 * Proof that the contract fence works (CONTRACT-01, 02-10): planted violations
 * outside src/features/contract/ fail both ESLint and the CI grep script, the
 * same code inside the module passes, and the real tree is clean.
 *
 * Node environment: ESLint and child_process need Node, not jsdom.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.resolve(DASHBOARD_ROOT, '..', 'scripts', 'check-contract-fence.mjs');

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

const VIOLATIONS: Array<{ name: string; code: string }> = [
  { name: 'a contract URL string literal', code: "export const u = 'https://d111111abcdef8.cloudfront.net/contract/latest.json';\n" },
  { name: 'a contract path in a template literal', code: 'export const u = (v: number) => `${base}/contract/latest.json?v=${v}`;\nconst base = "";\n' },
  { name: 'a versioned manifest path in a template literal', code: 'export const u = (base: string) => `${base}/contract/v1.json`;\n' },
  { name: 'a read of the contract base-URL env var', code: 'export const base = process.env.NEXT_PUBLIC_CONTRACT_BASE_URL;\n' },
  { name: 'a deep import of a contract internal', code: "import { loadManifest } from '@/features/contract/client';\nexport const m = loadManifest;\n" },
  { name: 'an import of contract fixtures', code: "import latest from '../../../contracts/fixtures/latest-v1.json';\nexport const l = latest;\n" },
];

let eslint: EslintLike;

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId && FENCE_RULES.includes(m.ruleId)).map((m) => m.ruleId as string);
}

describe('ESLint contract fence', () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: DASHBOARD_ROOT });
  });

  it.each(VIOLATIONS)('fails outside the contract module: $name', async ({ code }) => {
    const ids = await ruleIds(code, 'src/app/fence-probe.tsx');
    expect(ids.length).toBeGreaterThan(0);
  }, 60_000);

  it.each(VIOLATIONS)('passes inside the contract module: $name', async ({ code }) => {
    expect(await ruleIds(code, 'src/features/contract/fence-probe.ts')).toEqual([]);
  }, 60_000);

  it('allows the public barrel import from application code', async () => {
    const code = "import { useContract } from '@/features/contract';\nexport const h = useContract;\n";
    expect(await ruleIds(code, 'src/app/fence-probe.tsx')).toEqual([]);
  }, 60_000);
});

describe('grep contract fence', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-fence-'));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function makeTree(name: string, appCode: string): string {
    const root = path.join(tmp, name);
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'features', 'contract'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), appCode);
    // The module itself may hold every forbidden string.
    fs.writeFileSync(
      path.join(root, 'features', 'contract', 'config.ts'),
      "export const base = process.env.NEXT_PUBLIC_CONTRACT_BASE_URL ?? 'https://d111111abcdef8.cloudfront.net/';\n"
    );
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

  it('passes on a clean tree even though the contract module holds forbidden strings', () => {
    const root = makeTree('clean', "export const x = 1;\n");
    const result = run(root);
    expect(result.status).toBe(0);
  });

  const PLANTED: Array<{ name: string; code: string; rule: string }> = [
    { name: 'a contract host', code: "export const h = 'https://d111111abcdef8.cloudfront.net/';\n", rule: 'contract host' },
    { name: 'the pointer path', code: "export const p = 'contract/latest.json';\n", rule: 'contract pointer path' },
    { name: 'a versioned manifest path', code: "export const p = 'contract/v12.json';\n", rule: 'contract manifest path' },
    { name: 'the base-URL env var', code: 'export const b = process.env.NEXT_PUBLIC_CONTRACT_BASE_URL;\n', rule: 'contract base-URL env var' },
    { name: 'a fixture import', code: "import l from '../contracts/fixtures/latest-v1.json';\n", rule: 'contract fixture import' },
    { name: 'a backend sites call', code: 'export const s = () => api.getSites();\n', rule: 'backend sites client call' },
    { name: 'the old coordinate table', code: 'export const c = SITE_COORDINATES;\n', rule: 'hard-coded coordinate table' },
  ];

  it.each(PLANTED)('fails with file:line on $name', ({ code, rule }, index) => {
    const root = makeTree(`planted-${index}`, `// line one\n${code}`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`app/page.tsx:2: ${rule}`);
  });
});
