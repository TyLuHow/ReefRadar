import { test, expect, type Page } from '@playwright/test';
import { expectNoUnhandledApiCalls } from './support/mock-api';
import { SURFACE, ensureMocked, openSection, startTabbing } from './support/fixtures';

/**
 * Legacy isolation (04-22, DS-08; UI-SPEC "Legacy isolation", item 6): the legacy globals do not
 * leak into the instrument surface, and the legacy routes are unchanged by the kit.
 *
 * Inside the surface: the body paints the direction's ground, the page scrolls without smoothing,
 * the focus ring is the direction's focus token (not the legacy ochre), and the legacy 150 ms
 * universal transition does not apply. On legacy routes: the dark body and smooth scrolling stay,
 * and none of the instrument fonts load. The 33 Docker-pinned legacy screenshot baselines
 * (visual.spec.ts, the CI screenshot job) remain the authority for pixels; this spec reads the
 * computed values behind them.
 */

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/** A colour token, as the browser resolves it (hex to rgb), by painting it on a probe element. */
function resolvedToken(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    (document.querySelector('[data-surface="instrument"]') as HTMLElement).appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test.describe('the instrument surface', () => {
  test('the body paints --dir-ground over the viewport and the page does not smooth-scroll', async ({ page }) => {
    await openSection(page, 'tokens');
    await expect
      .poll(async () => {
        const ground = await resolvedToken(page, '--dir-ground');
        return page.evaluate(
          (expected) => ({
            body: getComputedStyle(document.body).backgroundColor === expected,
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
          }),
          ground,
        );
      })
      .toEqual({ body: true, scrollBehavior: 'auto' });
  });

  test('a tabbed-to Button rings in --dir-focus, never the legacy ochre', async ({ page }) => {
    await openSection(page, 'tokens');
    // Shift+Tab from the Reduced motion toggle lands on a Direction segment by the keyboard (focus-visible).
    await startTabbing(page);
    await page.keyboard.press('Shift+Tab');
    const first = page.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio').and(page.locator(':focus'));
    await expect(first).toHaveCount(1);
    await expect
      .poll(async () => {
        const focus = await resolvedToken(page, '--dir-focus');
        return first.evaluate((el, expected) => {
          const style = getComputedStyle(el);
          return { outline: style.outlineColor === expected, notOchre: style.outlineColor !== 'rgb(205, 133, 63)', style: style.outlineStyle };
        }, focus);
      })
      .toEqual({ outline: true, notOchre: true, style: 'solid' });
  });

  test('the legacy 150 ms transition does not reach a plain text element', async ({ page }) => {
    await openSection(page, 'tokens');
    // No reduced-motion preference here, so a zero duration can only mean the legacy rule did not apply.
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
    const text = page.locator('section#tokens p').first();
    await expect.poll(async () => text.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await expect.poll(async () => text.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('none');
    await expect(page.locator(SURFACE)).not.toHaveAttribute('data-reduced-motion', 'true');
  });
});

test.describe('legacy routes', () => {
  const ABYSS = 'rgb(26, 23, 20)';
  const NEW_FONT_FAMILY = /newsreader|hanken|spline|archivo/i;

  test('the legacy 150 ms universal transition is still in force on a legacy route, so the zero above means something', async ({ page }) => {
    await ensureMocked(page);
    await page.goto('/about/', { waitUntil: 'load' });
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('main p, p') as HTMLElement).transitionDuration))
      .toBe('0.15s');
  });

  for (const route of ['/', '/about/', '/sites/', '/dashboard/', '/dashboard/analyze/', '/dashboard/compare/', '/dashboard/map/', '/experience/']) {
    test(`${route} keeps its dark body, smooth scrolling and none of the instrument fonts`, async ({ page }) => {
      await ensureMocked(page);
      await page.goto(route, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(SURFACE)).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => ({
            body: getComputedStyle(document.body).backgroundColor,
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
          })),
        )
        .toEqual({ body: ABYSS, scrollBehavior: 'smooth' });
      const families = await page.evaluate(() => Array.from(document.fonts).map((face) => face.family));
      expect(families.filter((family) => NEW_FONT_FAMILY.test(family))).toEqual([]);
    });
  }
});
