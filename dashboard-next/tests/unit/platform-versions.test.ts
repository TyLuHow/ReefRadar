// @vitest-environment node
/**
 * PLAT-01 platform pins gate (03-04): the dashboard runs on Next 16 / React 19 with
 * an ESLint 9 flat config. Fails on a silent downgrade, a codemod-picked ESLint 10,
 * TypeScript 7, a Tailwind v4 jump, or a lost next.config key.
 *
 * Reads files relative to this test only; never touches the network.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  engines?: { node?: string };
}

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')) as T;
}

const pkg = readJson<PackageJson>('package.json');

function majorOf(range: string): number {
  const match = /(\d+)\./.exec(range);
  if (!match) throw new Error(`cannot read a major version from "${range}"`);
  return Number(match[1]);
}

describe('platform pins (PLAT-01)', () => {
  it('pins next, react and react-dom exactly', () => {
    expect(pkg.dependencies.next).toBe('16.3.8');
    expect(pkg.dependencies.react).toBe('19.3.0');
    expect(pkg.dependencies['react-dom']).toBe('19.3.0');
  });

  it('pins eslint 9.39.5 (never 10) and eslint-config-next 16.3.8', () => {
    expect(pkg.devDependencies.eslint).toBe('9.39.5');
    expect(pkg.devDependencies['eslint-config-next']).toBe('16.3.8');
  });

  it('pins the React type packages and the testing-library DOM peer', () => {
    expect(pkg.devDependencies['@types/react']).toBe('19.3.0');
    expect(pkg.devDependencies['@types/react-dom']).toBe('19.3.0');
    expect(pkg.devDependencies['@testing-library/dom']).toBe('10.4.2');
  });

  it('keeps Tailwind on v3 and TypeScript on 5.x', () => {
    expect(majorOf(pkg.devDependencies.tailwindcss)).toBe(3);
    expect(majorOf(pkg.devDependencies.typescript)).toBe(5);
  });

  it('lints through the ESLint CLI and declares the Node floor', () => {
    expect(pkg.scripts.lint).toBe('eslint .');
    expect(pkg.engines?.node).toBe('>=20.9.0');
  });

  it('has the installed next equal to the declared pin', () => {
    const installed = readJson<{ version: string }>('node_modules/next/package.json');
    expect(installed.version).toBe('16.3.8');
  });
});

describe('lint config files', () => {
  it('uses the flat config and no legacy .eslintrc.json', () => {
    expect(fs.existsSync(path.join(ROOT, 'eslint.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, '.eslintrc.json'))).toBe(false);
  });
});

describe('next.config.js', () => {
  // next.config.js is CommonJS; load it the same way Next does.
  const config = require(path.join(ROOT, 'next.config.js')) as {
    trailingSlash?: boolean;
    images?: { unoptimized?: boolean };
    agentRules?: boolean;
  };

  it('keeps trailingSlash and unoptimized images', () => {
    expect(config.trailingSlash).toBe(true);
    expect(config.images?.unoptimized).toBe(true);
  });

  it('turns agentRules off so next dev never writes agent files into the app', () => {
    expect(config.agentRules).toBe(false);
  });
});

describe('root layout', () => {
  it('keeps smooth in-page scrolling on the html element (Next 15+ needs the opt-in attribute)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8');
    expect(source).toContain('data-scroll-behavior="smooth"');
  });
});
