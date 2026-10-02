// @vitest-environment node
/**
 * Proof that the feature fence works (PLAT-03, 03-05): a legacy component
 * import planted inside src/features/** fails both ESLint and the CI grep
 * script, and the real tree passes.
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

describe('ESLint feature fence', () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: DASHBOARD_ROOT });
  });

  it('fails a static legacy import inside a feature', async () => {
    const ids = await ruleIds("import { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n", 'src/features/map/fence-probe.tsx');
    expect(ids).toContain('no-restricted-imports');
  }, 60_000);
});

describe('grep feature fence', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-fence-'));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('passes on the repository tree', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
    expect(out).toMatch(/^OK:/);
  });

  it('fails with file:line when a feature imports a legacy component', () => {
    const root = path.join(tmp, 'tracer');
    fs.mkdirSync(path.join(root, 'features', 'x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'features', 'x', 'a.ts'), "// line one\nimport { Navbar } from '@/components/Navbar';\nexport const n = Navbar;\n");
    const result = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('features/x/a.ts:2: legacy component import');
    expect(result.stderr).toContain('FAIL: 1 hit(s)');
  });
});
