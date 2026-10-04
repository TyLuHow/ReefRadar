import { test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';
import { STATES } from './support/states';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Computed-style fingerprint (Phase 4, plan 04-01). NOT part of the e2e project (playwright.config.ts
 * ignores it); run it with `playwright test -c playwright.fingerprint.config.ts`.
 *
 * For each of the 11 legacy states at 1440 and 390 px it records, for `body` and every `body *`
 * element in document order, a stable path, the bounding box and every computed property. Colours
 * are normalised in the browser (canvas read-back) so a Tailwind 3 build and a Tailwind 4 build
 * compare on what is painted, not on how the colour is serialised. The dump format is read by
 * scripts/style-fingerprint-diff.mjs:
 *   { names: string[], strings: string[], elements: [{ path, box: [x,y,w,h], v: number[] }] }
 * where v[i] indexes `strings` for the value of names[i].
 */

const OUT = process.env.FINGERPRINT_OUT;
if (!OUT) {
  throw new Error('FINGERPRINT_OUT must name the directory the fingerprint dumps are written to');
}
fs.mkdirSync(OUT, { recursive: true });

const FP_WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

// 1x1 transparent PNG so third-party map tiles never change the page between runs.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function blockMapTiles(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
  await page.route(/cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Let JS-driven entrance animations finish, then freeze CSS animations/transitions at a fixed
  // point so the sampled values do not depend on timing (the cascade itself is untouched).
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const end = a.effect?.getComputedTiming().endTime;
      if (end === Infinity) {
        a.pause();
        a.currentTime = 0;
      } else {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      }
    }
  });
}

/** Browser-side colour normaliser, shared by the state dump and the hover probe. */
const NORMALISER_SOURCE = `
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const FN = /\\b(rgba?|lab|oklab|oklch|lch|color)\\(([^()]*)\\)/g;
  function toRgba(fn) {
    let hit = cache.get(fn);
    if (hit !== undefined) return hit;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = fn;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    hit = 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (Math.round((d[3] / 255) * 1000) / 1000) + ')';
    cache.set(fn, hit);
    return hit;
  }
  function normalise(value) {
    return value.replace(FN, (m) => toRgba(m));
  }
`;

test.describe.configure({ mode: 'serial' });

for (const state of STATES) {
  for (const w of FP_WIDTHS) {
    test(`fingerprint ${state.name} @ ${w.width}`, async ({ page }) => {
      await mockApi(page);
      await blockMapTiles(page);
      await page.setViewportSize({ width: w.width, height: w.height });
      await page.goto(state.path, { waitUntil: 'load' });
      await settle(page);

      const dump = await page.evaluate(`(() => {
        ${NORMALISER_SOURCE}
        const names = [];
        const strings = [];
        const stringIndex = new Map();
        const intern = (s) => {
          let i = stringIndex.get(s);
          if (i === undefined) { i = strings.length; strings.push(s); stringIndex.set(s, i); }
          return i;
        };
        const round = (n) => Math.round(n * 100) / 100;
        const pathOf = (el) => {
          const parts = [];
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const tag = n.tagName.toLowerCase();
            let idx = 1;
            for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
              if (s.tagName === n.tagName) idx++;
            }
            parts.unshift(tag + ':' + idx);
          }
          return parts.join('>');
        };
        const elements = [];
        const all = [document.body, ...document.body.querySelectorAll('*')];
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (names.length === 0) for (let i = 0; i < cs.length; i++) names.push(cs[i]);
          const r = el.getBoundingClientRect();
          const v = names.map((n) => intern(normalise(cs.getPropertyValue(n))));
          elements.push({ path: pathOf(el), box: [round(r.x), round(r.y), round(r.width), round(r.height)], v });
        }
        return { names, strings, elements };
      })()`);
      fs.writeFileSync(path.join(OUT, `${state.name}-${w.width}.json`), JSON.stringify(dump));

      if (state.name === 'sites') {
        await page.mouse.move(0, 0);
        const card = page.locator('.glass-panel', { has: page.locator('h3') }).first();
        await card.scrollIntoViewIfNeeded();
        await card.hover();
        await page.waitForTimeout(600);
        const probe = await card.evaluate(
          (el, src) => {
            const run = new Function(
              'el',
              `${src}; const raw = getComputedStyle(el).borderTopColor; return { borderTopColor: normalise(raw), raw };`
            );
            return run(el) as { borderTopColor: string; raw: string };
          },
          NORMALISER_SOURCE
        );
        fs.writeFileSync(
          path.join(OUT, `sites-hover-${w.width}.json`),
          JSON.stringify(probe)
        );
      }
    });
  }
}
