import fs from 'node:fs';
import path from 'node:path';

/**
 * Test-only access to the real committed excerpts (public/audio/marrs) and their manifest.
 * Every clip here is a real MARRS recording excerpt (CC BY 4.0, see public/audio/ATTRIBUTION.md).
 */
const DASHBOARD_NEXT_ROOT = path.resolve(__dirname, '../../..');
const CLIP_DIR = path.join(DASHBOARD_NEXT_ROOT, 'public', 'audio', 'marrs');

export const CLIP_IDS = [
  'aus_D1_20230208_120000',
  'aus_H1_20230208_120000',
  'aus_H2_20230208_120000',
  'aus_R1_20230208_120000',
  'ind_D1_20220830_120000',
  'ind_H1_20220830_120000',
  'ind_N1_20220907_120000',
  'ind_R1_20220830_120000',
  'mex_R1_20230529_120000',
] as const;

/** The file's bytes as an ArrayBuffer that owns exactly those bytes. */
export function readClipBuffer(id: string): ArrayBuffer {
  const bytes = fs.readFileSync(path.join(CLIP_DIR, `${id}.wav`));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export type ManifestExcerpt = { excerpt_id: string; rms_dbfs: number };

export function readManifestExcerpts(): ManifestExcerpt[] {
  const manifestPath = path.join(DASHBOARD_NEXT_ROOT, 'src', 'data', 'audio-manifest.json');
  return (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { excerpts: ManifestExcerpt[] }).excerpts;
}
