import { describe, expect, it } from 'vitest';
import { buildReport, scrubMessage, scrubRoute, scrubStack, scrubText } from '@/features/monitoring/scrub';

// Every string below is fake: example.com hosts, made-up signatures and tokens.

describe('scrubText', () => {
  it('turns an https URL with a query into [url]', () => {
    const out = scrubText('failed https://reef-bucket.s3.amazonaws.com/a.wav?X-Amz-Signature=abc123def456 now');
    expect(out).toBe('failed [url] now');
  });

  it('turns other schemes that can carry a file or credential into [url]', () => {
    expect(scrubText('see blob:https://example.com/1234-5678')).toBe('see [url]');
    expect(scrubText('see data:audio/wav;base64,AAAA')).toBe('see [url]');
    expect(scrubText('see ws://example.com/socket?token=zzz')).toBe('see [url]');
  });

  it('keeps only the path of a relative path with a query and fragment', () => {
    expect(scrubText('GET /path?x=1#y failed')).toBe('GET /path failed');
    expect(scrubText('GET /path#frag failed')).toBe('GET /path failed');
    expect(scrubText('loaded reef.wav?download=1 ok')).toBe('loaded reef.wav ok');
  });

  it('replaces an email address with [email]', () => {
    expect(scrubText('mail visitor@example.com now')).toBe('mail [email] now');
  });

  it('replaces a run of 24 or more token characters with [token]', () => {
    const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0'; // 40 characters
    expect(token).toHaveLength(40);
    expect(scrubText(`key ${token} end`)).toBe('key [token] end');
    // 23 characters is left alone
    expect(scrubText('x'.repeat(23))).toBe('x'.repeat(23));
  });

  it('removes X-Amz-* parameters that appear outside a URL', () => {
    const out = scrubText('X-Amz-Credential=AKIAFAKEFAKE/20260101/us-east-1/s3 X-Amz-Signature=abc123 other');
    expect(out).not.toContain('X-Amz');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('AKIA');
    expect(out).toContain('other');
  });

  it('is idempotent', () => {
    const dirty =
      'x https://a.example.com/p?q=1 visitor@example.com /a/b?c=d#e A1b2C3d4E5f6G7h8I9j0K1l2M3n4 X-Amz-Signature=abc123';
    const once = scrubText(dirty);
    expect(scrubText(once)).toBe(once);
  });
});

describe('scrubText work on hostile input (CR-01)', () => {
  // Timing on shared CI hardware is noisy, so there is no tight wall-clock assertion. Two checks instead:
  //  1. a generous absolute ceiling for one 4 KB call (the old cubic regex took minutes), and
  //  2. near-linear scaling: cost per character at 4000 characters against 500 characters. Linear work
  //     gives a ratio near 1 (measured up to about 2.8 on a noisy run, from JIT and cache effects),
  //     quadratic about 6 to 8 and cubic far more, so the limit of 4 separates them with headroom.
  // Both sizes sit above every bounded quantifier in the patterns (the largest is the 256-character email
  // local part; the long-local-part shape below keeps its local part over 256 at 500 characters): below a
  // bound, cost per character is still rising even for linear code, which made an earlier 250-character
  // baseline report 4.3 on a linear shape. The upper size is the input cap (MAX_SCRUB_INPUT, 4000); a
  // larger input is cut to it and would measure nothing.
  // Each timing is the best of several rounds, which discards GC and scheduler spikes.
  const CEILING_MS = 500;
  const MAX_PER_CHAR_RATIO = 4;
  const SMALL = 500;
  const LARGE = 4_000;
  const rep = (unit: string, n: number) => unit.repeat(Math.max(1, Math.floor(n / unit.length)));

  const adversarial: Array<[string, (n: number) => string]> = [
    ['a run of slashes', (n) => rep('/', n)],
    ['alternating a/ segments with no query', (n) => rep('a/', n)],
    ['a long run of dots', (n) => rep('.', n)],
    ['a dotted token with no query', (n) => rep('a.', n)],
    ['many query markers in one slash token', (n) => rep('/?', n)],
    ['a long run of email-safe characters with no @', (n) => rep('a.b-c', n)],
    ['an @ followed by a long dotted domain', (n) => `a@${rep('a.', n)}`],
    ['a long local part before a dotted domain', (n) => `${rep('a', n * 0.75)}@${rep('b.', n * 0.25)}`],
    ['repeated @ signs', (n) => rep('a@', n)],
    ['a long token that ends in a fragment', (n) => `${rep('/x', n)}#end`],
    ['repeated X-Amz- keys', (n) => rep('X-Amz-', n)],
    ['dotted numbers', (n) => rep('1.', n)],
    ['colon-separated hex', (n) => rep('a:', n)],
    ['a long token-character run', (n) => rep('a', n)],
    ['one build-asset URL with a long colon-and-digit tail', (n) => `https://h/_next/a?${rep(':1', n)}`],
    ['one build-asset URL followed by a long run of closing parentheses', (n) => `https://h/_next/a:1:2${rep(')', n)}`],
    ['repeated build-asset URL starts', (n) => rep('https://h/_next/a?b:1 ', n)],
    ['repeated build-asset URL starts with no whitespace', (n) => rep('https://h/_next/', n)],
  ];

  function scrubAll(input: string): void {
    scrubText(input);
    scrubStack(input);
    scrubMessage(input);
  }

  /** Best-of-5 seconds per character, with the work per round held near 40 000 characters. */
  function perChar(input: string): number {
    const reps = Math.max(1, Math.ceil(40_000 / input.length));
    scrubAll(input); // warm up
    let best = Infinity;
    for (let round = 0; round < 5; round += 1) {
      const started = performance.now();
      for (let i = 0; i < reps; i += 1) scrubAll(input);
      best = Math.min(best, (performance.now() - started) / (reps * input.length));
    }
    return best;
  }

  it.each(adversarial)('scrubs %s within the ceiling and scales linearly', (_label, make) => {
    const large = make(LARGE);
    const started = performance.now();
    scrubAll(large);
    expect(performance.now() - started).toBeLessThan(CEILING_MS);

    const ratio = perChar(large) / perChar(make(SMALL));
    expect(ratio).toBeLessThan(MAX_PER_CHAR_RATIO);
  });

  it('cuts a 10 KB hostile input to the cap before any pattern runs', () => {
    const started = performance.now();
    scrubAll('/'.repeat(10_000));
    scrubAll('.'.repeat(10_000));
    expect(performance.now() - started).toBeLessThan(CEILING_MS);
  });

  it('still removes every query and fragment from a path token, including a second one', () => {
    expect(scrubText('GET /a?b=1/c?d=2 x')).toBe('GET /a x');
    expect(scrubText('see reef.wav?x=1#y ok')).toBe('see reef.wav ok');
    expect(scrubText('a.wav?x=b.png?y=2')).toBe('a.wav');
    expect(scrubText('/a/b/c#frag')).toBe('/a/b/c');
  });

  it('leaves ordinary punctuation and extension-less words alone', () => {
    expect(scrubText('did it work? yes')).toBe('did it work? yes');
    expect(scrubText('Error: x#1 failed')).toBe('Error: x#1 failed');
    expect(scrubText('v1.2 shipped')).toBe('v1.2 shipped');
  });
});

describe('scrubMessage, scrubStack and scrubRoute', () => {
  it('cuts a 1000 character message to 300', () => {
    const out = scrubMessage('a b '.repeat(250));
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.length).toBeGreaterThan(200);
  });

  it('keeps a single line', () => {
    expect(scrubMessage('one\ntwo\r\nthree')).toBe('one two three');
  });

  it('keeps 8 stack lines of at most 200 characters from a 20 line stack', () => {
    const stack = Array.from({ length: 20 }, (_, i) => `    at fn${i} ${'x'.repeat(10)}${' y'.repeat(150)}`).join('\n');
    const lines = scrubStack(stack).split('\n');
    expect(lines).toHaveLength(8);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(200);
    expect(lines[0]).toContain('fn0');
    expect(lines[7]).toContain('fn7');
  });

  it('scrubs inside stack lines', () => {
    const out = scrubStack('Error: boom\n    at f (https://example.com/_next/static/a.js?v=1:1:2)');
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('?v=1');
    // WR-01: the build-asset path and the line:col stay, so a minified frame still locates the failure.
    expect(out).toContain('at f (/_next/static/a.js:1:2)');
  });

  it('keeps the asset path and line:col of a same-site frame, drops origin, query and fragment', () => {
    const out = scrubStack(
      'TypeError: x\n    at e (https://site.example.com/_next/static/chunks/app/page-1a2b.js:1:23456)\n    at t (https://site.example.com/_next/static/chunks/main.js?dpl=abc#h:7:8)',
    );
    expect(out).toContain('at e (/_next/static/chunks/app/page-1a2b.js:1:23456)');
    expect(out).toContain('at t (/_next/static/chunks/main.js:7:8)');
    expect(out).not.toContain('site.example.com');
    expect(out).not.toContain('dpl=');
  });

  it('drops a query or fragment that contains a colon, a URL or a file name, keeping only path and line:col', () => {
    const cases: Array<[string, string]> = [
      [
        'at e (https://x.com/_next/image?url=https://bkt.s3.amazonaws.com/uploads/me.wav?X-Amz-Signature=abc&w=64:1:2)',
        'at e (/_next/image:1:2)',
      ],
      ['at e (https://x.com/_next/static/a.js?v=tok:SECRETSECRET:1:2)', 'at e (/_next/static/a.js:1:2)'],
      ['at e (https://x.com/_next/static/a.js#frag:secret/foo.wav:1:2)', 'at e (/_next/static/a.js:1:2)'],
      // no query: a colon inside the path still cannot smuggle a second URL through
      // (the kept "https:1:2" then reads as a scheme, so the later URL pass turns it into [url])
      ['at e (https://x.com/_next/https://evil.example/me.wav:1:2)', 'at e (/_next/[url]'],
    ];
    for (const [input, expected] of cases) {
      const out = scrubStack(input);
      expect(out).toBe(expected);
      for (const leaked of ['bkt', 'amazonaws', 'me.wav', 'SECRET', 'secret/foo', 'X-Amz', 'evil']) {
        expect(out).not.toContain(leaked);
      }
    }
    expect(scrubText('https://h/_next/static/chunks/a.js:1:23456')).toBe('/_next/static/chunks/a.js:1:23456');
    // Safari/Firefox frame shape (no parentheses) and an asset with no location
    expect(scrubText('e@https://h/_next/static/a.js:7:8')).toBe('e@/_next/static/a.js:7:8');
    expect(scrubText('load https://h/_next/static/a.js?v=1 failed')).toBe('load /_next/static/a.js failed');
  });

  it('still replaces a non-asset URL, even in a stack frame, with [url]', () => {
    const out = scrubStack('Error: x\n    at f (https://reef-bucket.s3.amazonaws.com/uploads/a.wav?X-Amz-Signature=abc123:1:2)');
    expect(out).toContain('[url]');
    expect(out).not.toContain('amazonaws');
    expect(out).not.toContain('a.wav');
  });

  it('replaces IPv4 and IPv6 addresses in a message with [ip]', () => {
    expect(scrubText('connect to 192.168.1.20 failed')).toBe('connect to [ip] failed');
    expect(scrubText('peer 2001:db8:85a3:0:0:8a2e:370:7334 gone')).toBe('peer [ip] gone');
    expect(scrubText('peer fe80::1 gone')).toBe('peer [ip] gone');
    // line:col pairs and version-like text are not addresses
    expect(scrubText('at e (/_next/static/a.js:12:34)')).toBe('at e (/_next/static/a.js:12:34)');
    expect(scrubText('React 19.2 on port 3000')).toBe('React 19.2 on port 3000');
  });

  it('keeps a pathname only', () => {
    expect(scrubRoute('/sites/?q=secret#top')).toBe('/sites/');
    expect(scrubRoute('/about/')).toBe('/about/');
  });
});

describe('buildReport', () => {
  it('returns exactly the eight schema fields and nothing else', () => {
    const error = Object.assign(new Error('boom'), {
      userAgent: 'Mozilla/5.0 fake',
      cookies: 'session=abc',
      extra: 'x',
      digest: '12345',
    });
    const report = buildReport(error, { source: 'error-boundary', route: '/about/' });
    expect(Object.keys(report).sort()).toEqual(['digest', 'message', 'name', 'route', 'source', 'stack', 'ts', 'v']);
    expect(report.v).toBe(1);
    expect(report.source).toBe('error-boundary');
    expect(report.name).toBe('Error');
    expect(report.message).toBe('boom');
    expect(report.route).toBe('/about/');
    expect(report.digest).toBe('12345');
    expect(typeof report.ts).toBe('number');
    const wire = JSON.stringify(report);
    for (const forbidden of ['userAgent', 'Mozilla', 'cookies', 'session=abc', 'extra']) {
      expect(wire).not.toContain(forbidden);
    }
  });

  it('scrubs the message and stack of a hostile error', () => {
    const error = new Error('probe https://reef-bucket.s3.amazonaws.com/a.wav?X-Amz-Signature=abc123 visitor@example.com');
    const report = buildReport(error, { source: 'window-error', route: '/sites/?q=1#x' });
    const wire = JSON.stringify(report);
    for (const forbidden of ['amazonaws', 'X-Amz', 'abc123', 'example.com', 'visitor@', '?q=1', '#x']) {
      expect(wire).not.toContain(forbidden);
    }
    expect(report.message).toBe('probe [url] [email]');
    expect(report.route).toBe('/sites/');
  });

  it('describes a non-Error rejection reason as a scrubbed string', () => {
    const report = buildReport('failed for visitor@example.com', { source: 'unhandledrejection', route: '/' });
    expect(report.name).toBe('UnhandledRejection');
    expect(report.message).toBe('failed for [email]');
    expect(report.stack).toBe('');
    expect(buildReport({ code: 7 }, { source: 'unhandledrejection', route: '/' }).message).toBe('{"code":7}');
    expect(buildReport(undefined, { source: 'unhandledrejection', route: '/' }).message).toBe('undefined');
  });

  it('defaults the digest to null and the route to the current pathname', () => {
    const report = buildReport(new Error('x'), { source: 'window-error' });
    expect(report.digest).toBeNull();
    expect(report.route).toBe(location.pathname);
  });
});
