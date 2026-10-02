import { createElement, type ReactNode } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_CONTRACT_BASE_URL } from '@/features/contract/config';
import * as schema from '@/features/contract/schema';
import { useCoverage, useModelVersion } from '@/features/contract/hooks';
import { installContractFetch, REPO_ROOT, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

/**
 * 02-07: the hand-mirrored Zod schemas must agree with the JSON Schemas.
 *  - Verdict parity: for every entry of contracts/fixtures/parity-corpus.json
 *    (verdicts recorded from Python's jsonschema by plan 02-03), Zod's
 *    safeParse success equals the corpus verdict.
 *  - Structural parity: each object node's property-key set and required set
 *    equal the JSON Schema's, and every regex pattern is the same text.
 * If Zod cannot express a construct identically, the Zod side is adjusted,
 * never the JSON Schema.
 */

// tests/unit -> tests -> dashboard-next -> repo root
const CONTRACTS = path.join(REPO_ROOT, 'contracts');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function readJson(...segments: string[]): Json {
  return JSON.parse(fs.readFileSync(path.join(...segments), 'utf-8')) as Json;
}

const schemaFile = (stem: string): Json => readJson(CONTRACTS, 'schema', `${stem}.schema.json`);

interface CorpusEntry {
  case: string;
  schema: string;
  verdict: 'valid' | 'invalid';
  instance: unknown;
}

const corpus = readJson(CONTRACTS, 'fixtures', 'parity-corpus.json') as unknown as CorpusEntry[];

const VERDICT_SCHEMAS: Record<string, z.ZodType> = {
  'analysis-result': schema.AnalysisResultStamp,
  'contract-manifest': schema.ContractManifest,
  'contract-pointer': schema.ContractPointer,
  'model-version': schema.ModelVersion,
  'preprocessing-spec': schema.PreprocessingSpec,
  projection: schema.Projection,
  site: schema.ContractSite,
};

describe('Zod mirror verdict parity with Python jsonschema', () => {
  it('covers every schema with a mix of valid and invalid entries', () => {
    expect(Array.isArray(corpus)).toBe(true);
    expect(corpus.length).toBeGreaterThan(100);
    for (const stem of Object.keys(VERDICT_SCHEMAS)) {
      const entries = corpus.filter((entry) => entry.schema === stem);
      expect(entries.length, `no corpus entries for ${stem}`).toBeGreaterThan(0);
      expect(entries.some((e) => e.verdict === 'valid'), `no valid entry for ${stem}`).toBe(true);
      expect(entries.some((e) => e.verdict === 'invalid'), `no invalid entry for ${stem}`).toBe(true);
    }
  });

  it('returns the corpus verdict for every entry', () => {
    const disagreements: string[] = [];
    for (const entry of corpus) {
      const mirror = VERDICT_SCHEMAS[entry.schema];
      if (!mirror) {
        disagreements.push(`${entry.case}: no Zod schema mapped for "${entry.schema}"`);
        continue;
      }
      const zodValid = mirror.safeParse(entry.instance).success;
      if (zodValid !== (entry.verdict === 'valid')) {
        disagreements.push(`${entry.schema} :: ${entry.case}: Python says ${entry.verdict}, Zod says ${zodValid ? 'valid' : 'invalid'}`);
      }
    }
    expect(disagreements, `${disagreements.length} disagreement(s):\n${disagreements.join('\n')}`).toEqual([]);
  });
});

// ---- structural parity ----------------------------------------------------

interface ObjectNode {
  properties?: Record<string, Json>;
  required?: string[];
}

/** Properties and required of a node, merged with the nodes it extends through allOf $refs. */
function flatten(node: Json, root: Json): { properties: Record<string, Json>; required: string[] } {
  const properties: Record<string, Json> = { ...(node.properties ?? {}) };
  const required = new Set<string>(node.required ?? []);
  for (const part of node.allOf ?? []) {
    const target: Json = part.$ref ? root.$defs[String(part.$ref).replace('#/$defs/', '')] : part;
    const merged = flatten(target, root);
    for (const [key, value] of Object.entries(merged.properties)) properties[key] = properties[key] ?? value;
    merged.required.forEach((key) => required.add(key));
  }
  return { properties, required: Array.from(required) };
}

/** The regex text a property constrains its string to (directly or on a nullable branch), "/"-normalised. */
function patternOf(node: Json | undefined): string | undefined {
  if (!node) return undefined;
  const found: string | undefined = node.pattern ?? node.anyOf?.map((b: Json) => b.pattern).find(Boolean);
  return found?.replace(/\\\//g, '/');
}

function resolveRef(node: Json, root: Json): Json {
  return node.$ref ? root.$defs[String(node.$ref).replace('#/$defs/', '')] : node;
}

interface Pair {
  name: string;
  base: z.ZodType;
  json: (root: Json) => Json;
  file: string;
}

const PAIRS: Pair[] = [
  { name: 'manifest top level', base: schema.ContractManifestBase, file: 'contract-manifest', json: (r) => r },
  { name: 'manifest coverage', base: schema.CoverageBase, file: 'contract-manifest', json: (r) => r.properties.coverage },
  { name: 'manifest artifacts', base: schema.ManifestArtifactsBase, file: 'contract-manifest', json: (r) => r.properties.artifacts },
  { name: 'manifest present artifact', base: schema.PresentArtifactBase, file: 'contract-manifest', json: (r) => r.$defs.artifact },
  { name: 'manifest embeddings artifact', base: schema.EmbeddingsArtifactBase, file: 'contract-manifest', json: (r) => r.$defs.embeddings_artifact },
  { name: 'manifest projection artifact', base: schema.ProjectionArtifactBase, file: 'contract-manifest', json: (r) => r.$defs.projection_artifact },
  { name: 'manifest absent artifact', base: schema.AbsentArtifactBase, file: 'contract-manifest', json: (r) => r.$defs.absent_artifact },
  { name: 'manifest dataset', base: schema.DatasetBase, file: 'contract-manifest', json: (r) => r.properties.datasets.items },
  { name: 'pointer', base: schema.ContractPointerBase, file: 'contract-pointer', json: (r) => r },
  { name: 'site', base: schema.ContractSiteBase, file: 'site', json: (r) => r },
  { name: 'site projection', base: schema.SiteProjectionBase, file: 'site', json: (r) => r.properties.projection },
  { name: 'model version', base: schema.ModelVersionBase, file: 'model-version', json: (r) => r },
  { name: 'model training', base: schema.ModelTrainingBase, file: 'model-version', json: (r) => r.properties.training },
  { name: 'model architecture', base: schema.ModelArchitectureBase, file: 'model-version', json: (r) => r.properties.architecture },
  { name: 'model embedding_model', base: schema.EmbeddingModelBase, file: 'model-version', json: (r) => r.properties.embedding_model },
  { name: 'model predecessor', base: schema.ModelPredecessorBase, file: 'model-version', json: (r) => r.properties.predecessor },
  { name: 'preprocessing spec', base: schema.PreprocessingSpecBase, file: 'preprocessing-spec', json: (r) => r },
  { name: 'preprocessing resampling', base: schema.ResamplingBase, file: 'preprocessing-spec', json: (r) => r.properties.resampling },
  { name: 'preprocessing serving', base: schema.ServingBase, file: 'preprocessing-spec', json: (r) => r.properties.serving },
  { name: 'preprocessing known gap', base: schema.KnownGapBase, file: 'preprocessing-spec', json: (r) => r.properties.known_gaps.items },
  { name: 'projection', base: schema.ProjectionBase, file: 'projection', json: (r) => r },
  { name: 'projection coordinate', base: schema.ProjectionCoordinateBase, file: 'projection', json: (r) => r.properties.coordinates.items },
  { name: 'analysis result stamp', base: schema.AnalysisResultStampBase, file: 'analysis-result', json: (r) => r },
];

describe('Zod mirror structural parity with the JSON Schemas', () => {
  it.each(PAIRS)('$name: property and required sets are equal', ({ base, file, json }) => {
    const root = schemaFile(file);
    const node = resolveRef(json(root), root);
    const expected = flatten(node, root);
    const actual = z.toJSONSchema(base, { unrepresentable: 'any' }) as ObjectNode;

    expect(Object.keys(actual.properties ?? {}).sort()).toEqual(Object.keys(expected.properties).sort());
    expect([...(actual.required ?? [])].sort()).toEqual([...expected.required].sort());
  });

  it.each(PAIRS)('$name: every regex pattern is the same text', ({ base, file, json }) => {
    const root = schemaFile(file);
    const expected = flatten(resolveRef(json(root), root), root);
    const actual = z.toJSONSchema(base, { unrepresentable: 'any' }) as ObjectNode;

    for (const [key, node] of Object.entries(expected.properties)) {
      const jsonPattern = patternOf(resolveRef(node, root));
      if (jsonPattern === undefined) continue;
      expect(patternOf(actual.properties?.[key]), `${key} pattern`).toBe(jsonPattern);
    }
  });
});

describe('contract base URL', () => {
  it('equals the CloudFront domain recorded in infrastructure/resources.json', () => {
    const resources = readJson(REPO_ROOT, 'infrastructure', 'resources.json');
    const domain = resources.cloudfront.distributions.contract.domain_name as string;
    expect(domain).toMatch(/^[a-z0-9]+\.cloudfront\.net$/);
    expect(DEFAULT_CONTRACT_BASE_URL).toBe(`https://${domain}/`);
  });
});

describe('model and coverage hooks', () => {
  let handle: ContractFetchHandle;
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    client = new QueryClient();
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  it('useModelVersion resolves the v1 model_version.json verified against the manifest', async () => {
    const { result } = renderHook(() => useModelVersion(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.model_version).toBe('interim-real-only');
    expect(result.current.version).toBe(1);
    expect(handle.requests).toContain('v1/model_version.json');
  });

  it('useCoverage returns the manifest coverage block, all four flags false for v1', async () => {
    const { result } = renderHook(() => useCoverage(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({
      has_diel: false,
      has_detections: false,
      has_pre_post_event: false,
      has_effort: false,
      total_sites: 54,
      sites_with_embeddings: 48,
    });
  });

  it('a pinned fixture v2 shows has_diel true and does not request the pointer', async () => {
    const { result } = renderHook(() => useCoverage(2), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.has_diel).toBe(true);
    expect(handle.requests).not.toContain('contract/latest.json');
  });
});
