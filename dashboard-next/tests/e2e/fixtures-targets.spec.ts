import { test, expect, type Page } from '@playwright/test';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { DIRECTION_NAMES, SURFACE, openSection, startTabbing, stateCell, tabTo } from './support/fixtures';
import { FIXTURE_SLUGS } from '../../src/features/fixtures/slugs';

/**
 * Touch targets and the focus ring on /dev/fixtures (04-22, DS-04).
 *
 * Touch targets: under coarse-pointer emulation at phone width every button, link, slider thumb,
 * option, row and switch has a hit area of at least 44 x 44 px (UI-SPEC "Spacing Scale", Touch
 * targets). A control whose painted box is smaller reaches 44 px through an invisible expansion (the
 * `hit-area` utility, or a `before:` expansion on the thumb); that expansion is not trusted from the
 * CSS but probed: the expanded box must return the control itself from document.elementFromPoint at
 * its four extremes, and a control marked data-hit-expanded must also return itself 6 px outside its
 * painted box.
 *
 * Focus ring: a solid outline in the direction's focus token, never the legacy ochre and never a
 * box-shadow, so forced-colours mode keeps it.
 */

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const MIN = 44;
const INTERACTIVE = 'button, a[href], [role="slider"], [role="option"], [role="row"], [role="switch"]';

interface Offender {
  selector: string;
  width: number;
  height: number;
  reason: string;
}

/**
 * Measure every interactive element in the surface, in the page (scroll, probe and measure in one
 * evaluate, so nothing moves between steps). Returns the elements that fall short.
 */
async function undersizedTargets(page: Page): Promise<{ checked: number; offenders: Offender[]; exempt: string[] }> {
  return page.evaluate(
    ({ surface, interactive, min }) => {
      const root = document.querySelector(surface) as HTMLElement;
      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : '';
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        const cell = el.closest('[data-fixture-state]');
        const where = cell ? `${cell.getAttribute('data-fixture-primitive')}/${cell.getAttribute('data-fixture-state')} ` : '';
        return `${where}${el.tagName.toLowerCase()}${id}[${el.getAttribute('role') ?? ''}] "${label}"`;
      };
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      /** A slider is a visually hidden input inside its thumb; the thumb is what the finger hits. */
      const measured = (el: HTMLElement): HTMLElement => {
        if (el.getAttribute('role') === 'slider' || (el instanceof HTMLInputElement && el.type === 'range')) {
          return (el.closest('div[data-rac]') as HTMLElement | null) ?? el;
        }
        return el;
      };
      /** True when a point resolves to `el` or something inside it. */
      const hits = (el: Element, x: number, y: number) => {
        const top = document.elementFromPoint(x, y);
        return top !== null && (top === el || el.contains(top));
      };

      const offenders: Offender[] = [];
      /** Every element an exemption swallowed, so a new exempt control fails the sweep instead of passing it. */
      const exempt: string[] = [];
      let checked = 0;
      const seen = new Set<Element>();
      for (const found of Array.from(root.querySelectorAll<HTMLElement>(interactive))) {
        if (found.closest('[data-visual="skip"]') !== null) continue;
        const el = measured(found);
        if (seen.has(el)) continue;
        seen.add(el);
        if (!visible(el)) continue;
        checked += 1;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        if (r.width >= min && r.height >= min) continue;

        // Two classes of control have a width that is not theirs to choose, so the 44 px width rule
        // cannot be met without breaking another UI-SPEC rule. They keep the 44 px height rule and a
        // width floor, and are named as an open design question in the 04-22 summary:
        //  - a WindowStrip cell is one 5 s window aligned under the time axis (cell k covers
        //    5k to 5k + 5 s), so on a phone six windows are about 39 px wide; floor 24 px (WCAG 2.5.8).
        //    A dense strip (cells under 16 px, long uploads) is narrower by design: height only.
        //  - a StatusBand segment is sized by its count (UI-SPEC "Minimum segment width 4 px"), so its
        //    width is data, not design: height only.
        const strip = el.closest('[role="listbox"][data-dense]');
        if (strip !== null || el.hasAttribute('data-segment')) {
          exempt.push(`${strip !== null ? 'strip-cell' : 'segment'}: ${describe(el)}`);
          const floor = strip !== null && strip.getAttribute('data-dense') === 'false' ? 24 : 0;
          if (r.height < min - 0.5 || r.width < floor) {
            offenders.push({ selector: describe(el), width: Math.round(r.width), height: Math.round(r.height), reason: 'geometry-bound cell under its floor' });
          }
          continue;
        }

        // A link inside a sentence of an attribution footer ("Audio: Ben Williams ... doi.org/...") is an inline
        // target, which WCAG 2.5.8 exempts from the size rule. The exemption is scoped to a paragraph inside a
        // footer (or one marked data-inline-links), not to any paragraph, and every link it swallows is recorded.
        if (el instanceof HTMLAnchorElement && el.parentElement?.tagName === 'P' && el.closest('footer p, [data-inline-links]') !== null) {
          const own = Array.from(el.parentElement.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .trim();
          if (own.length >= 3) {
            exempt.push(`inline-link: ${describe(el)}`);
            continue;
          }
        }

        // Painted box is smaller: it must reach 44 px through a probed expansion.
        let left = r.left;
        let top = r.top;
        let right = r.right;
        let bottom = r.bottom;
        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (cs.content === 'none' || cs.position !== 'absolute') continue;
          const pl = parseFloat(cs.left);
          const pt = parseFloat(cs.top);
          const pw = parseFloat(cs.width);
          const ph = parseFloat(cs.height);
          if ([pl, pt, pw, ph].some(Number.isNaN)) continue;
          const l = r.left + el.clientLeft + pl;
          const t = r.top + el.clientTop + pt;
          left = Math.min(left, l);
          top = Math.min(top, t);
          right = Math.max(right, l + pw);
          bottom = Math.max(bottom, t + ph);
        }
        const width = right - left;
        const height = bottom - top;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const probes: Array<[number, number]> = [
          [left + 1, cy],
          [right - 1, cy],
          [cx, top + 1],
          [cx, bottom - 1],
        ];
        const reachable = probes.every(([x, y]) => hits(el, x, y));
        if (width < min - 0.5 || height < min - 0.5) {
          offenders.push({ selector: describe(el), width: Math.round(width), height: Math.round(height), reason: 'hit area under 44 px' });
        } else if (!reachable) {
          offenders.push({ selector: describe(el), width: Math.round(width), height: Math.round(height), reason: 'expansion is covered: elementFromPoint returns another element' });
        } else if (el.hasAttribute('data-hit-expanded')) {
          const outside: Array<[number, number]> = [
            [r.left - 6, (r.top + r.bottom) / 2],
            [r.right + 6, (r.top + r.bottom) / 2],
            [(r.left + r.right) / 2, r.top - 6],
            [(r.left + r.right) / 2, r.bottom + 6],
          ];
          const ok = outside.every(([x, y]) => hits(el, x, y));
          if (!ok) offenders.push({ selector: describe(el), width: Math.round(width), height: Math.round(height), reason: 'does not answer 6 px outside its painted box' });
        }
      }
      return { checked, offenders, exempt };
    },
    { surface: SURFACE, interactive: INTERACTIVE, min: MIN },
  );
}

/**
 * What each exemption may swallow, per section. A new exempt control (a link in a new paragraph, a cell in a new
 * strip) fails the sweep and has to be listed here on purpose. The caps are the live counts with a little headroom
 * for the data (36 cells live: the section holds several strips).
 */
const COMPOSITION_SLUGS = ['composition-inspector', 'composition-listen', 'composition-compare', 'composition-explore'];
const INLINE_FOOTER_LINKS = ['CC BY 4.0', 'doi.org/10.5522/04/29958062'];
const EXEMPT_CAPS: Record<string, Record<string, number>> = {
  'window-strip': { 'strip-cell': 40 },
  'status-band': { segment: 4 },
};

function expectExemptions(slug: string, exempt: string[]) {
  for (const kind of ['strip-cell', 'segment', 'inline-link']) {
    const mine = exempt.filter((entry) => entry.startsWith(`${kind}:`));
    if (kind === 'inline-link') {
      const names = mine.map((entry) => /"([^"]*)"$/.exec(entry)?.[1] ?? entry).sort();
      expect(names, `${slug}: inline-link exemptions`).toEqual(COMPOSITION_SLUGS.includes(slug) ? [...INLINE_FOOTER_LINKS].sort() : []);
    } else {
      expect(mine.length, `${slug}: ${kind} exemptions: ${mine.join(' | ')}`).toBeLessThanOrEqual(EXEMPT_CAPS[slug]?.[kind] ?? 0);
    }
  }
}

test.describe('touch targets under coarse-pointer emulation', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the emulation really is a coarse pointer', async ({ page }) => {
    await openSection(page, 'button');
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
  });

  for (const slug of FIXTURE_SLUGS) {
    test(`${slug}: every control has a 44 x 44 px hit area`, async ({ page }) => {
      test.setTimeout(90_000);
      await openSection(page, slug);
      const { checked, offenders, exempt } = await undersizedTargets(page);
      expect(offenders.map((o) => `${o.selector}: ${o.width} x ${o.height} (${o.reason})`)).toEqual([]);
      expectExemptions(slug, exempt);
      // Sections with no control at all (tokens, scales) check zero; every other section must have found some.
      if (!['tokens', 'status-palette', 'spectrogram-scale', 'numerals', 'states'].includes(slug)) expect(checked).toBeGreaterThan(0);
    });
  }
});

test.describe('focus ring', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // The legacy ochre ring (rgb(205, 133, 63)) must never appear on the instrument surface.
  for (const direction of DIRECTION_NAMES) {
    test(`a tabbed-to Button shows a solid ${direction} focus-token outline and no box-shadow`, async ({ page }) => {
      await openSection(page, 'button', { direction });
      const button = stateCell(page, 'button', 'default').getByRole('button').first();
      await startTabbing(page);
      await tabTo(page, button);
      await expect
        .poll(async () =>
          button.evaluate((el) => {
            const surface = el.closest('[data-surface="instrument"]') as HTMLElement;
            // The focus token as the browser resolves it, converted to rgb by painting it on a probe.
            const probe = document.createElement('span');
            probe.style.color = 'var(--dir-focus)';
            surface.appendChild(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            const style = getComputedStyle(el);
            return {
              direction: surface.getAttribute('data-direction'),
              outlineStyle: style.outlineStyle,
              outlineColour: style.outlineColor === expected,
              notOchre: style.outlineColor !== 'rgb(205, 133, 63)',
              boxShadow: style.boxShadow,
              width: style.outlineWidth !== '0px',
            };
          }),
        )
        .toEqual({ direction, outlineStyle: 'solid', outlineColour: true, notOchre: true, boxShadow: 'none', width: true });
    });
  }
});
