// @vitest-environment node
/**
 * Phase 4 guard (UI-SPEC "Legacy isolation" item 1): the 33 Linux visual baselines in
 * tests/e2e/visual.spec.ts-snapshots are the truth for the legacy routes and must not change
 * while the design system lands. This test pins the exact set of file names and the sha256 of
 * every file.
 *
 * Change the record below only together with an owner-accepted visual review. Never
 * regenerate the baselines as a side effect of a styling change.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_BASELINE_SHA256: Record<string, string> = {
  'about-1024-visual-linux.png':
    'bc7da15b1a3c742d80e8eac9ffb93386367c7835a5c13afb2fb67f060352784f',
  'about-1440-visual-linux.png':
    '1024ae623dfcc4b00e98ad45564142756d504b5f63b9f020fee53fe471376b91',
  'about-390-visual-linux.png':
    'df3fbb03662e76081ac5888defff6adf53348113780e5dd249d34ee9a430cb16',
  'analyze-1024-visual-linux.png':
    '31f1cc7f2181f0b11391010780f8fcc0e2ba654dd622802c53b642a868fe484a',
  'analyze-1440-visual-linux.png':
    '340075ac9cc87645a5a42870c6f30fceedcc7866d9cba1c3d65786feb959996d',
  'analyze-390-visual-linux.png':
    'b4723fa86aeba3dc5b3bac2e06a7d58205f69bd687fcff679a197105090695ba',
  'compare-1024-visual-linux.png':
    '260687e0d37cd0fabcd5944d97520d1a806ed82eedb91676fb8351f43b0067e5',
  'compare-1440-visual-linux.png':
    'f1c99cb7d5c1bf1ac394f944bedb0cea9d632c6ce22840ac3c1bf524eb93edd6',
  'compare-390-visual-linux.png':
    '4b148439e8fb639ddbaa7db534acbe3a0c60432c6062a8ea402c774f3d4bafb2',
  'dashboard-1024-visual-linux.png':
    '38de877c701d9c26b30d917fbe4052eab7af2e2d28d9b451f7ef08a83f17f517',
  'dashboard-1440-visual-linux.png':
    'a7034b287e3fe0e638d81971c90e6a342f59210f268ec15bbb58b506fff803db',
  'dashboard-390-visual-linux.png':
    '059ccc7f565a2da12418566b5b4a7f5c39e0946a5d63f21be13b1f4f49dd5949',
  'experience-1024-visual-linux.png':
    '3f075492a76520b89a44c8cc40808437c1deb9bdc51947692716a1e44c9dcb8b',
  'experience-1440-visual-linux.png':
    '0cc4b946576711da181075c910e21fe063aed0c6bc18ec48145725aeb98d05d0',
  'experience-390-visual-linux.png':
    '84cee5830c9fa7c4ba7f93823f5be4e320f1a6ebe5f4b83c81a2d207f20d0a6c',
  'experience-compare-1024-visual-linux.png':
    'a6011f32eb6b6e8018260469fcc59aaf0e93bc34de60d00f1edca332997264a3',
  'experience-compare-1440-visual-linux.png':
    '79135fa690d51b6b1bf5030a35e24a9a73c4d535d673dafc4898e17bafc7a948',
  'experience-compare-390-visual-linux.png':
    'aa4507d757df133e7c4fee8bafedfa54cd51edc7f5aa4df4dcc51a74ea8b92e5',
  'experience-demo-1024-visual-linux.png':
    '8d7480778cde36bd7382056ebb6aa3308dc4c0263c76018e17fdc8e893a7fcf2',
  'experience-demo-1440-visual-linux.png':
    'c7c228b9395ebac541e88acc0b2657108eee4f2fc637b4eeb2c8c7f8179e4934',
  'experience-demo-390-visual-linux.png':
    'f5c5ab48e207ab6a6fb8f0c1ef1d666d9df498ccb7aa29360a7d0b0586ca3323',
  'experience-sample-1024-visual-linux.png':
    '21e0932110f8d5af9bbbdb96621144a63736926c1282a2a00bdf20167462ce7f',
  'experience-sample-1440-visual-linux.png':
    '8cb633a3dc0dc3ee9d5149257accd7123d5dbc67dbd934df068f1476ad6e51d5',
  'experience-sample-390-visual-linux.png':
    'b2e4b411817ca21ad26bbade7f68bab0e252012b6c2fcb4a25d652c80decc568',
  'landing-1024-visual-linux.png':
    '9d2e630f453dd4c1a50ba8bd28cd174cf72ff4ebc9765932b5a198269c419195',
  'landing-1440-visual-linux.png':
    '4282957484d7065f72177974ac8bdd30b211eb0d1398a80d157799064272aa61',
  'landing-390-visual-linux.png':
    'e04490a9c50492edb4ad166382a2ecf6e0a35ab48b0f0bdbcf6104db23e67eab',
  'map-1024-visual-linux.png':
    '8352049c9d4eb72f0fb3658b208ebdb61c8246f85a5ac7e7b45c8b26c0abf6e2',
  'map-1440-visual-linux.png':
    '18ae37ebd624f2f9924a76a5cf7fb19b8b3fe2f5a017c456007b1009b857ac12',
  'map-390-visual-linux.png':
    '653e8fe631650c3270eaa267830a2d20ab618717a6d03b8ed38ae8a4e484e55d',
  'sites-1024-visual-linux.png':
    'a0f86393f7a3c2da6f20fc08eaf0961546c4eee93314a28586df243c2a432f9e',
  'sites-1440-visual-linux.png':
    '619802aca25ae7ca21a10300bcc7e530e4c08ce46a5ae54ab6e06a03f42ad559',
  'sites-390-visual-linux.png':
    'a26357555e98d3944493435780e1ffe67f06d73f5756da9ba3d6ad640091e8c8',
};

const SNAPSHOT_DIR = path.resolve(__dirname, '../e2e/visual.spec.ts-snapshots');

describe('legacy visual baselines', () => {
  it('holds exactly the 33 recorded files (none added, none removed)', () => {
    const recorded = Object.keys(LEGACY_BASELINE_SHA256).sort();
    expect(recorded).toHaveLength(33);
    expect(fs.readdirSync(SNAPSHOT_DIR).sort()).toEqual(recorded);
  });

  it('keeps every baseline byte-identical to the pre-phase file', () => {
    const changed = Object.entries(LEGACY_BASELINE_SHA256)
      .filter(([name, sha]) => {
        const bytes = fs.readFileSync(path.join(SNAPSHOT_DIR, name));
        return crypto.createHash('sha256').update(bytes).digest('hex') !== sha;
      })
      .map(([name]) => name);
    expect(changed, 'baselines whose bytes changed').toEqual([]);
  });
});
