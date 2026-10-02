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
    expect(out).toContain('[url]');
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
