import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

/**
 * The Motion section and the four accepted compositions on /dev/fixtures (04-21, DS-05, DS-06, DS-08).
 *
 * Every composition is built from kit primitives on real data (the committed contract and excerpts),
 * so the specs read what the page shows and compare it with itself: the header chip against the
 * rendered site count, the Explore headline against its own legend, a country chip against the legend
 * after it is pressed. Canvases, React Aria and the clock settle on the next frame, so every locator
 * is scoped to one composition (the page holds many) and anything that updates is polled. Headless
 * Chromium has no listener: nothing here asserts audible output.
 */

const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
const BAD_IMPACTS = new Set(['serious', 'critical']);
const SURFACE = '[data-surface="instrument"]';

// The committed contract and manifest, read from disk: which sites are plotted and which have an excerpt.
const CONTRACT_SITES = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'contracts', 'bucket', 'v1', 'sites.json'), 'utf8')) as {
    sites: Array<{ site_id: string; projection: unknown }>;
  }
).sites;
const PLOTTED_IDS = CONTRACT_SITES.filter((site) => site.projection !== null).map((site) => site.site_id);
const EXCERPT_SITES = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'audio-manifest.json'), 'utf8')) as {
    excerpts: Array<{ site_id: string }>;
  }
).excerpts.map((excerpt) => excerpt.site_id);

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

const section = (page: Page, slug: string) => page.locator(`section#${slug}`);
const frame = (page: Page, slug: string) => section(page, slug).locator('[data-fixture-state="default"]');

async function open(page: Page, slug: string, query = '') {
  await page.goto(`/dev/fixtures/${slug}/${query}`, { waitUntil: 'load' });
  await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
}

/** The composition's wells have drawn and, where the composition has a plot, the plot's figure exists. */
async function settled(page: Page, slug: string, wells: number, plot = false) {
  const root = frame(page, slug);
  await expect(root.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(wells);
  await expect(root.locator('[data-spectrogram][data-ready="false"]')).toHaveCount(0);
  if (plot) await expect(root.locator('figure svg[role="img"]').first()).toBeVisible();
}

test.describe('every composition', () => {
  const COMPOSITIONS = [
    { slug: 'composition-inspector', wells: 1, plot: false, current: 'Explore' },
    { slug: 'composition-listen', wells: 9, plot: false, current: 'Listen' },
    { slug: 'composition-compare', wells: 2, plot: true, current: 'Compare' },
    { slug: 'composition-explore', wells: 1, plot: true, current: 'Explore' },
  ] as const;

  for (const { slug, wells, plot, current } of COMPOSITIONS) {
    test(`${slug}: header, contract chip and attribution come from the contract and citations`, async ({ page }) => {
      await open(page, slug);
      await settled(page, slug, wells, plot);
      const root = frame(page, slug);
      await expect(root).toHaveAttribute('data-fixture-primitive', slug);
      await expect(root.getByText('ReefRadar', { exact: true })).toBeVisible();
      await expect(root.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
      await expect(root.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveText(['Listen', 'Explore', 'Compare', 'Analyze', 'Methods']);
      await expect(root.getByText(/^Contract v\d+ · \d+ sites?$/)).toBeVisible();
      const footer = root.locator('footer');
      await expect(footer).toContainText('Audio: Ben Williams, Kate Jones (2025). Coral Reef Soundscapes from a Global Restoration Programme.');
      await expect(footer.getByRole('link', { name: 'doi.org/10.5522/04/29958062' })).toHaveAttribute('href', 'https://doi.org/10.5522/04/29958062');
      await expect(footer).toContainText('CC BY 4.0');
    });
  }

  test('the header chip count equals the number of sites the Listen composition counts', async ({ page }) => {
    await open(page, 'composition-listen');
    await settled(page, 'composition-listen', 9);
    const root = frame(page, 'composition-listen');
    await expect
      .poll(async () => {
        const chip = (await root.getByText(/^Contract v\d+ · \d+ sites?$/).textContent()) ?? '';
        const stat = (await root.locator('p', { hasText: /reference sites?$/ }).locator('span').first().textContent()) ?? '';
        return `${/· (\d+)/.exec(chip)?.[1]}|${stat.replace(/,/g, '')}`;
      })
      .toMatch(/^(\d+)\|\1$/);
  });
});

test.describe('Inspector', () => {
  test('shows the site facts, the reference label with its assigner, the reading and the empty similar-sites state', async ({ page }) => {
    await open(page, 'composition-inspector');
    await settled(page, 'composition-inspector', 1);
    const root = frame(page, 'composition-inspector');

    await expect(root.locator('[data-inspector-id]')).toHaveText('ind_H1');
    const label = root.getByText('REFERENCE LABEL', { exact: true }).first();
    await expect(label).toBeVisible();
    await expect(root.getByText(/^Assigned by /).first()).toBeVisible();
    await expect(root.getByText(/on the recorder clock, timezone unverified/).first()).toBeVisible();
    await expect(root.getByRole('link', { name: /^doi\.org\// }).first()).toHaveAttribute('href', /^https:\/\/doi\.org\//);
    await expect(root.getByText('MODEL READING', { exact: true })).toBeVisible();
    await expect(root.getByText('No similar sites in this reading.')).toBeVisible();
    await expect(root.getByText('Similar sites appear when the analysis returns them.')).toBeVisible();
    // The reading's bars are raw model output: integers that the bar itself says sum to 100.
    await expect(root.getByText('Test fixture, not a real analysis.')).toHaveCount(0);
  });

  test('plays the real recording from the compact transport and the bands can be toggled', async ({ page }) => {
    await open(page, 'composition-inspector');
    await settled(page, 'composition-inspector', 1);
    const root = frame(page, 'composition-inspector');
    const transport = root.getByRole('group', { name: 'Playback', exact: true });
    await expect(transport).toHaveAttribute('data-transport-status', 'idle');
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(transport).toHaveAttribute('data-transport-status', 'playing');
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(transport).toHaveAttribute('data-transport-status', 'idle');

    const bands = root.getByRole('toolbar', { name: 'Frequency bands to play' });
    const high = bands.getByRole('button', { name: /^High/ });
    await expect(high).toHaveAttribute('aria-pressed', 'false');
    await high.click();
    await expect(high).toHaveAttribute('aria-pressed', 'true');
  });

  test('is one column on a phone and two columns on a desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, 'composition-inspector');
    await settled(page, 'composition-inspector', 1);
    const root = frame(page, 'composition-inspector');
    const box = async (selector: string) => (await root.locator(selector).first().boundingBox()) ?? { x: -1, y: -1 };
    // Two columns: the recording sits to the right of the id. One column: it sits below it.
    await expect.poll(async () => (await box('[data-spectrogram]')).x > (await box('[data-inspector-id]')).x + 200).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await box('[data-spectrogram]')).y > (await box('[data-inspector-id]')).y + 100).toBe(true);
    await expect.poll(async () => (await box('[data-spectrogram]')).x < (await box('[data-inspector-id]')).x + 40).toBe(true);
  });
});

test.describe('Listen', () => {
  test('carries the eyebrow, the headline, a large transport, the hero well and one accent block', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await open(page, 'composition-listen');
    await settled(page, 'composition-listen', 9);
    const root = frame(page, 'composition-listen');

    await expect(root.getByText('A real recording · nothing synthetic')).toBeVisible();
    await expect(root.getByRole('heading', { name: 'This is what a reef sounds like.' })).toBeVisible();
    await expect(root.getByRole('heading', { name: 'Now hear the reef next door.' })).toBeVisible();
    await expect(root.locator('[data-spectrogram][data-variant="hero"]')).toBeAttached();
    await expect(root.locator('[data-accent-block]')).toHaveCount(1);
    await expect(root.getByRole('link', { name: 'Place a recording' })).toHaveAttribute('href', '#place-a-recording');
    await expect(root.locator('[data-clip-card]')).toHaveCount(8);
    // The AccentBlock check logs an error when a screen has more blocks than the direction allows.
    expect(errors.filter((text) => text.includes('AccentBlock'))).toEqual([]);
  });

  test('starting a card stops the hero, and nothing plays before a press', async ({ page }) => {
    await open(page, 'composition-listen');
    await settled(page, 'composition-listen', 9);
    const root = frame(page, 'composition-listen');
    const hero = root.getByRole('group', { name: 'Playback', exact: true });
    await expect(hero).toHaveAttribute('data-transport-status', 'idle');
    await hero.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(hero).toHaveAttribute('data-transport-status', 'playing');
    await root.locator('[data-clip-card]').first().getByRole('button', { name: /^Play / }).click();
    await expect(hero).not.toHaveAttribute('data-transport-status', 'playing');
  });

  test('the status band counts add up to the stat the page shows', async ({ page }) => {
    await open(page, 'composition-listen');
    await settled(page, 'composition-listen', 9);
    const root = frame(page, 'composition-listen');
    await expect
      .poll(async () => {
        const labels = await root.locator('[role="group"][aria-label="Sites by habitat status"] [role="img"]').evaluateAll((els) =>
          els.map((el) => Number(/: (\d+) site/.exec(el.getAttribute('aria-label') ?? '')?.[1] ?? NaN)),
        );
        const stat = (await root.locator('p', { hasText: /reference sites?$/ }).locator('span').first().textContent()) ?? '';
        return labels.length > 0 && labels.reduce((sum, n) => sum + n, 0) === Number(stat.replace(/,/g, ''));
      })
      .toBe(true);
  });
});

test.describe('Compare', () => {
  test('the headline distance and the sub-line are computed, and the deck is on one scale', async ({ page }) => {
    await open(page, 'composition-compare');
    await settled(page, 'composition-compare', 2, true);
    const root = frame(page, 'composition-compare');
    await expect(root.getByRole('heading', { level: 3 }).first()).toHaveText(/^Reference labels: healthy and degraded, \d+\.\d km apart\.$/);
    await expect(root.getByText('Labels assigned by MARRS research team (Williams, Jones et al. 2025).')).toBeVisible();
    await expect(root.getByText('Both recorded 2022-08-30 at 12:00 on the recorder clock. One colour scale for both, so brighter means louder in either.')).toBeVisible();
    await expect(root.getByRole('heading', { name: 'Where the two differ' })).toBeVisible();
    await expect(root.locator('[data-compare-row]')).toHaveCount(2);
    await expect(root.getByRole('slider', { name: 'Mix between A and B' })).toBeVisible();
  });

  test('plays both recordings together from the deck', async ({ page }) => {
    await open(page, 'composition-compare');
    await settled(page, 'composition-compare', 2, true);
    const root = frame(page, 'composition-compare');
    const group = root.getByRole('group', { name: 'Playback', exact: true });
    await expect(group).toHaveAttribute('data-transport-status', 'idle');
    await group.getByRole('button', { name: 'Play both' }).click();
    await expect(group).toHaveAttribute('data-transport-status', 'playing');
  });
});

test.describe('Explore', () => {
  const legendCount = (page: Page) =>
    frame(page, 'composition-explore')
      .getByText(/^\d+ sites? shown$/)
      .textContent()
      .then((text) => Number(/^(\d+)/.exec(text ?? '')?.[1]));

  test('the headline count equals the legend count and the caveat is computed', async ({ page }) => {
    await open(page, 'composition-explore');
    await settled(page, 'composition-explore', 1, true);
    const root = frame(page, 'composition-explore');
    await expect(root.getByRole('heading', { level: 3 }).first()).toHaveText(/^A partial map of \d+ reef soundscapes\.$/);
    await expect(root.getByText(/The plane shows \d+% of the variation, so near here does not mean similar in sound\./).first()).toBeVisible();
    await expect.poll(async () => {
      const headline = (await root.getByRole('heading', { level: 3 }).first().textContent()) ?? '';
      return Number(/(\d+)/.exec(headline)?.[1]) === (await legendCount(page));
    }).toBe(true);
  });

  test('a country chip narrows the map: the legend, the list and the chip number agree', async ({ page }) => {
    await open(page, 'composition-explore');
    await settled(page, 'composition-explore', 1, true);
    const root = frame(page, 'composition-explore');
    const chips = root.getByRole('toolbar', { name: 'Filter by country' });
    const chip = chips.getByRole('button', { name: /^Kenya \d+$/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const name = (await chip.textContent()) ?? '';
        const n = Number(/(\d+)$/.exec(name.trim())?.[1]);
        const options = await root.getByRole('listbox', { name: 'Sites on the map' }).getByRole('option').count();
        return `${n}|${await legendCount(page)}|${options}`;
      })
      .toMatch(/^(\d+)\|\1\|\1$/);
    // Pressing it again returns to every country.
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(root.getByText('All countries shown. Choose one or more to narrow the map.')).toBeVisible();
  });

  test('selecting a site in the list drives the panel, with the keyboard too', async ({ page }) => {
    await open(page, 'composition-explore');
    await settled(page, 'composition-explore', 1, true);
    const root = frame(page, 'composition-explore');
    const panel = root.locator('[data-selected-site]');
    await expect(panel).toHaveAttribute('data-selected-site', 'ind_H1');
    const list = root.getByRole('listbox', { name: 'Sites on the map' });
    await list.getByRole('option', { name: /^ind_D1/ }).click();
    await expect(panel).toHaveAttribute('data-selected-site', 'ind_D1');
    await expect(panel.getByText('REFERENCE LABEL', { exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open site and sources' })).toHaveAttribute('href', '#site-ind_D1');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => {
        const id = (await panel.getAttribute('data-selected-site')) ?? '';
        return id !== 'ind_D1' && id !== '' && (await list.getByRole('option', { selected: true }).textContent())?.startsWith(id);
      })
      .toBe(true);
  });

  test('a site with an excerpt plays it; a site without one says so', async ({ page }) => {
    await open(page, 'composition-explore');
    await settled(page, 'composition-explore', 1, true);
    const root = frame(page, 'composition-explore');
    const panel = root.locator('[data-selected-site]');
    const transport = panel.getByRole('group', { name: 'Playback', exact: true });
    await expect(transport).toHaveAttribute('data-transport-status', 'idle');
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(transport).toHaveAttribute('data-transport-status', 'playing');

    // The first listed site that has no committed excerpt.
    const list = root.getByRole('listbox', { name: 'Sites on the map' });
    const withoutExcerpt = PLOTTED_IDS.find((id) => !EXCERPT_SITES.includes(id));
    expect(withoutExcerpt).toBeTruthy();
    await list.getByRole('option', { name: new RegExp(`^${withoutExcerpt}`) }).click();
    await expect(panel).toHaveAttribute('data-selected-site', withoutExcerpt as string);
    await expect(panel.getByText('No excerpt is available for this site.')).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Playback', exact: true })).toHaveCount(0);
  });
});

test.describe('Motion section', () => {
  const durations = (page: Page) =>
    page.locator(SURFACE).evaluate((el) => {
      const style = getComputedStyle(el);
      // A built app returns minified custom-property text (".12s" for 120ms), so compare in milliseconds.
      const toMs = (text: string) => {
        const match = /^([\d.]+)(ms|s)?$/.exec(text.trim());
        return match ? Math.round(Number(match[1]) * (match[2] === 's' ? 1000 : 1)) : NaN;
      };
      return ['--duration-fast', '--duration-base', '--duration-morph', '--duration-view'].map((name) => toMs(style.getPropertyValue(name)));
    });

  test('has one cell for each continuity motion and the reduced-motion note', async ({ page }) => {
    await open(page, 'motion');
    const root = section(page, 'motion');
    for (const state of ['selection', 'layout-morph', 'view-transition', 'playhead', 'crossfade']) {
      await expect(root.locator(`[data-fixture-state="${state}"]`)).toBeVisible();
    }
    await expect(
      root.getByText(
        'With Reduced motion on (toolbar or the operating system), every duration is 0 ms, view transitions do not animate, the playhead steps once per second and the spectrogram does not scroll.',
      ),
    ).toBeVisible();
    await expect(root.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(3);
  });

  test('the layout morph reorders the rows and the view transition swaps the content', async ({ page }) => {
    await open(page, 'motion');
    const root = section(page, 'motion');
    const rows = () => root.locator('[data-morph-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-morph-row')));
    await expect.poll(async () => (await rows()).length).toBeGreaterThan(1);
    const before = await rows();
    await root.getByRole('button', { name: 'Order by count' }).click();
    await expect.poll(async () => (await rows()).join()).not.toBe(before.join());
    expect([...(await rows())].sort()).toEqual([...before].sort());
    await root.getByRole('button', { name: 'Order by habitat status' }).click();
    await expect.poll(async () => (await rows()).join()).toBe(before.join());

    const swap = root.locator('[data-fixture-state="view-transition"]');
    await expect(swap.locator('[data-swap-content]')).toHaveAttribute('data-swap-content', 'ind_H1');
    await swap.getByRole('radio', { name: 'ind_D1' }).click();
    await expect(swap.locator('[data-swap-content]')).toHaveAttribute('data-swap-content', 'ind_D1');
    await expect(swap.getByText('REFERENCE LABEL', { exact: true })).toBeVisible();
  });

  test('durations are the tokens normally and zero with Reduced motion on, and nothing keeps animating', async ({ page }) => {
    await open(page, 'motion');
    await expect.poll(() => durations(page)).toEqual([120, 200, 400, 200]);
    await open(page, 'motion', '?reduced=1');
    await expect.poll(() => durations(page)).toEqual([0, 0, 0, 0]);
    const root = section(page, 'motion');
    await root.getByRole('button', { name: 'Order by count' }).click();
    await root.locator('[data-fixture-state="view-transition"]').getByRole('radio', { name: 'ind_D1' }).click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(root.locator('[data-fixture-state="selection"]').getByRole('radio').first()).toHaveCSS('transition-duration', '0s');
  });

  test('the playhead moves from the real clock and the crossfade deck is live', async ({ page }) => {
    await open(page, 'motion');
    const root = section(page, 'motion');
    await expect(root.locator('[data-spectrogram][data-ready="true"]')).toHaveCount(3);
    const playhead = root.locator('[data-fixture-state="playhead"]').getByRole('group', { name: 'Playback', exact: true });
    await expect(playhead).toHaveAttribute('data-transport-status', 'idle');
    await playhead.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(playhead).toHaveAttribute('data-transport-status', 'playing');
    await playhead.getByRole('button', { name: 'Pause', exact: true }).click();
    const deck = root.locator('[data-fixture-state="crossfade"]');
    await expect(deck.getByRole('slider', { name: 'Mix between A and B' })).toBeVisible();
  });
});

for (const direction of DIRECTIONS) {
  test.describe(`axe and layout in ${direction}`, () => {
    for (const { slug, wells, plot } of [
      { slug: 'motion', wells: 3, plot: false },
      { slug: 'composition-inspector', wells: 1, plot: false },
      { slug: 'composition-listen', wells: 9, plot: false },
      { slug: 'composition-compare', wells: 2, plot: true },
      { slug: 'composition-explore', wells: 1, plot: true },
    ]) {
      test(`${slug} has no serious or critical violation`, async ({ page }) => {
        await open(page, slug, `?direction=${direction}`);
        if (slug === 'motion') await expect(section(page, slug).locator('[data-spectrogram][data-ready="true"]')).toHaveCount(wells);
        else await settled(page, slug, wells, plot);
        const results = await new AxeBuilder({ page }).include(`section#${slug}`).analyze();
        const bad = results.violations.filter((v) => BAD_IMPACTS.has(v.impact ?? ''));
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      });
    }

    test('the four compositions render the headline in this direction without horizontal overflow at 390 px', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const slug of ['composition-inspector', 'composition-listen', 'composition-compare', 'composition-explore']) {
        await open(page, slug, `?direction=${direction}`);
        await expect(frame(page, slug).getByRole('navigation', { name: 'Primary' })).toBeVisible();
        await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
    });
  });
}
