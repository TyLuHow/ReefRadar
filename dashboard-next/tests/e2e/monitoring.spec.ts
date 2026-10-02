import { test, expect, type Request } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

/** Next's own route announcer is role=alert; it is not part of the reporter. */
const REPORT_UI = '[role="alert"]:not(#__next-route-announcer__), [role="status"]';

/**
 * 03-12 (PLAT-09): an uncaught page error becomes exactly one silent, scrubbed
 * same-origin POST that the route answers with 204. All strings below are fake.
 */
test.describe('client error reporter', () => {
  test('a thrown error posts one scrubbed report to /api/client-error/ and shows nothing', async ({ page }) => {
    await mockApi(page);

    const posts: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/client-error/') {
        posts.push(request);
      }
    });
    // The page error is expected: Playwright surfaces it as pageerror, which is not a failure here.
    page.on('pageerror', () => {});

    await page.goto('/about/', { waitUntil: 'networkidle' });
    expect(posts).toHaveLength(0);
    await expect(page.locator(REPORT_UI)).toHaveCount(0);
    const textBefore = await page.locator('body').innerText();

    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/client-error/'
    );
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error(
          'probe https://reef-bucket.s3.amazonaws.com/a.wav?X-Amz-Signature=abc123def456ghi789jkl012mno345 visitor@example.com'
        );
      }, 0);
    });
    const response = await responsePromise;

    // Same-origin POST to the trailing-slash path: 204, never a 308 redirect.
    expect(response.status()).toBe(204);
    expect(response.request().redirectedFrom()).toBeNull();
    expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);

    // Let any (unwanted) second report land before counting.
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(1);
    expect(posts[0].headers()['content-type']).toContain('application/json');

    const raw = posts[0].postData() ?? '';
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['digest', 'message', 'name', 'route', 'source', 'stack', 'ts', 'v']);
    expect(body.v).toBe(1);
    expect(body.source).toBe('window-error');
    expect(body.name).toBe('Error');
    expect(body.route).toBe('/about/');
    expect(body.message).toContain('[url]');
    expect(body.message).toContain('[email]');
    for (const forbidden of ['amazonaws', 'X-Amz', 'abc123def456', 'example.com', 'visitor@', '://']) {
      expect(raw).not.toContain(forbidden);
    }

    // No visible UI: nothing announced, text unchanged.
    await expect(page.locator(REPORT_UI)).toHaveCount(0);
    expect(await page.locator('body').innerText()).toBe(textBefore);
  });
});

/**
 * 03-13 (PLAT-09): Vercel Speed Insights is in the root layout. It adds no visible DOM;
 * locally the e2e mock answers /_vercel/speed-insights/* so the script request is not a 404.
 */
test.describe('Speed Insights', () => {
  async function snapshot(page: import('@playwright/test').Page) {
    return {
      // The /about status line carries a wall-clock time; it is not part of what is being compared.
      text: (await page.locator('body').innerText()).replace(/Last checked: .*/g, 'Last checked: <time>'),
      announcements: await page.locator(REPORT_UI).count(),
    };
  }

  test('requests its script from /_vercel/speed-insights/ and changes nothing visible', async ({ page }) => {
    await mockApi(page);
    const insightsRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/_vercel/speed-insights/')) insightsRequests.push(pathname);
    });

    const scriptResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith('/_vercel/speed-insights/')
    );
    await page.goto('/about/', { waitUntil: 'networkidle' });
    expect((await scriptResponse).status()).toBe(200);
    expect(insightsRequests.length).toBeGreaterThan(0);
    const withInsights = await snapshot(page);

    // Same page with the Speed Insights route aborted: nothing visible differs.
    const aborted = await page.context().newPage();
    await mockApi(aborted);
    await aborted.route(/\/_vercel\/speed-insights\//, (route) => route.abort('failed'));
    await aborted.goto('/about/', { waitUntil: 'networkidle' });
    const withoutInsights = await snapshot(aborted);
    await aborted.close();

    expect(withInsights).toEqual(withoutInsights);
    expect(withInsights.announcements).toBe(0);
  });
});
