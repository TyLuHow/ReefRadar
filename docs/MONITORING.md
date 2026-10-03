# Monitoring: web vitals and browser error logs

Written 2026-10-02 for the site owner (plan 03-13, requirement PLAT-09). This page says where to look, what you
will see, and how long it lasts. Nothing here needs a code change to read.

There are two signals. Both come only from sites served by Vercel. Neither exists for a copy of the site run on a
laptop.

| Signal | What it tells you | Where to open it |
|---|---|---|
| Web vitals (Speed Insights) | How fast pages feel to real visitors | Vercel dashboard, the `dashboard-next` project, **Speed Insights** tab |
| Browser errors | An uncaught error or a failed render a visitor hit | Vercel dashboard, the `dashboard-next` project, **Logs** tab |

## Speed Insights (web vitals)

- Open: Vercel dashboard, the `dashboard-next` project, **Speed Insights** tab.
- The site loads Vercel's Speed Insights script on every page (`@vercel/speed-insights`, rendered once in
  `dashboard-next/src/app/layout.tsx`). It adds nothing you can see on the page.
- Free tier limits (Vercel documentation, vercel.com/docs/speed-insights/limits-and-pricing):
  - You get the **Real Experience Score** only. Individual Core Web Vitals need the paid Speed Insights Plus
    add-on on a Pro plan.
  - **10,000 events per rolling 30 days**, shared across the team. After that, collection pauses for at least
    14 days.
  - Data appears after a few days of visitors, not instantly.
- Data comes only from Vercel deployments. The production merge is on hold, so until it happens the only traffic is
  on preview deployments of the `redesign/v2-discovery` branch. Those previews sit behind Vercel Deployment
  Protection, so only people signed in to the team can load them. Whether protected-preview traffic is counted in
  the Speed Insights figures is not confirmed: if the tab stays empty after you have browsed a preview for a few
  days, that is the likely reason and not a fault in the site.

## Browser error logs

- Open: Vercel dashboard, the `dashboard-next` project, **Logs** tab.
- Set the filters:
  - **Request Path** = `/api/client-error/` (keep the trailing slash)
  - **Level** = `Error`
  - Optionally search for `client-error`.
- Each report is one log line that starts with `client-error ` followed by one line of JSON:

  ```
  client-error {"evt":"client-error","v":1,"source":"window-error","name":"Error","message":"...","stack":"...","route":"/about/","digest":null,"ts":1790000000000,"build":"<commit>"}
  ```

  | Field | Meaning |
  |---|---|
  | `evt` | Always `client-error` |
  | `v` | Format version, currently 1 |
  | `source` | `window-error` (uncaught error), `unhandledrejection` (a promise that failed with nobody handling it), `error-boundary` (a page failed to render and showed the error page), `global-error` (the whole site failed to render) |
  | `name`, `message`, `stack` | What the browser reported, after scrubbing and shortening |
  | `route` | The page path only, for example `/about/` |
  | `digest` | The short reference Next.js gives a server render failure, or `null`. The visitor sees the same value as "Error reference" on the error page |
  | `ts` | Time the browser made the report, in milliseconds since 1970 |
  | `build` | The first 40 characters of the deployed commit, or `null` outside Vercel |

### What is scrubbed

The browser scrubs each report before sending it, and the server scrubs it again before logging, so a forged
request cannot put these in your logs.

- Web addresses (with their query strings and fragments), email addresses, runs of 24 or more letters, digits,
  `-` or `_` (likely tokens or ids), and `X-Amz-` signing parameters are replaced with `[url]`, `[email]` or
  `[token]`, or removed.
- Messages are cut to 300 characters; stacks to 8 lines of 200 characters.
- The route is the path only. No query string, no user agent, no IP address, no cookies, no stored values, no audio
  file names are sent.

### Limits on reporting

- A page load sends at most 5 reports, and the same error (same name and first stack frame) is sent at most once
  per 60 seconds. Known browser noise (`ResizeObserver loop` warnings and the bare cross-origin `Script error.`)
  is ignored.
- The route accepts only same-site JSON posts up to 4 KB and rejects anything with extra fields.
- The route also limits itself to 30 reports per minute. **That limit is per server instance and best effort.**
  Vercel runs several instances at busy times and each keeps its own count, so the real ceiling can be higher. It
  is a guard against accidental floods, not a global quota.
- A failed report is dropped silently. A visitor never sees that something was or was not reported, and the error
  pages never claim it was.

## Retention: how long the logs last

Log lines are kept for a short time, set by the Vercel plan. **On Hobby the error logs are kept for 1 hour.** You
chose that on 2026-10-02 and accepted that errors are not a durable history: if nobody opens the Logs tab within an
hour of an error, the line is gone.

| Vercel plan | Runtime log retention |
|---|---|
| Hobby (current choice) | 1 hour |
| Pro | 1 day |
| Pro with Observability Plus | 30 days |
| Enterprise | 3 days |

Source: Vercel documentation, vercel.com/docs/logs/runtime. The Speed Insights score history is separate from this
table and is not affected by it.

## How to test it

Send one clearly fake report to a deployment you can reach, then look for it in the Logs tab within the hour. The
host below is a placeholder.

```
curl -i -X POST "https://<your-deployment-host>/api/client-error/" \
  -H "content-type: application/json" \
  --data '{"v":1,"source":"window-error","name":"Error","message":"phase-3 monitoring probe","stack":"","route":"/probe/","digest":null,"ts":1790000000000}'
```

- Expected answer: `204 No Content`. Keep the trailing slash: without it the site answers `308` and a POST is not
  repeated.
- A protected preview refuses unauthenticated requests. Use `vercel curl <path> --deployment <url>` from a signed-in
  Vercel CLI, which sends the platform credentials for you, rather than sharing a bypass secret.
- Then open Logs with the filters above. You should see one line starting `client-error ` with route `/probe/` and
  the message `phase-3 monitoring probe`.
- Other answers: `415` not JSON, `413` body over 4 KB, `403` the request came from a different site, `400` the body
  does not match the format exactly, `429` more than 30 reports this minute on that instance.

### Status of this check

Checked on 2026-10-03 against a preview deployment of this branch (built from commit `4a2721a`, previously
`5bfe91d` before the 2026-10-03 history rewrite; Next.js 16.3.8 on Vercel). The preview has Deployment Protection on,
so the requests were sent with `vercel curl`.

| Check | Result |
|---|---|
| Build state | Ready |
| `GET /_vercel/speed-insights/script.js` | 200 |
| `POST /api/client-error/` with the probe payload above | 204 |
| `vercel logs` | the line `client-error {"evt":"client-error","v":1,"source":"window-error","name":"Error","message":"phase-3 monitoring probe",...}` was seen |
| Malformed probe (`stack: null`) | 400, and nothing was logged |

The remaining human check is the one only you can do with your Vercel login: within one hour of a probe, open the Logs
tab with the filters above and confirm the line there, and confirm the Speed Insights tab exists. Whether Speed
Insights counts visits to a protected preview was not checked.

## Deferred

Sentry (or another error service with longer history, grouping and alerts) is deferred. Revisit it if Vercel logs
prove insufficient: for example if the 1-hour window on Hobby is too short to catch errors, or if you want
notifications instead of looking in the tab.
