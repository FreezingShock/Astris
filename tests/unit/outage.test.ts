import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ArticleNotFoundError, BadReplyError, HttpError, backoffMs, classify, diagnose } from '../../src/data';
import { Http } from '../../src/data/http';
import { RetryLoop } from '../../src/modes/outage';

const abort = new DOMException('x', 'AbortError');
const timeout = new DOMException('x', 'TimeoutError');

describe('classify', () => {
  it.each([
    [new HttpError(429, 'u'), 'busy'],
    [new HttpError(503, 'u'), 'down'],
    [new HttpError(500, 'u'), 'down'],
    [new HttpError(403, 'u'), 'blocked'],
    [new HttpError(407, 'u'), 'blocked'],
    [new HttpError(451, 'u'), 'blocked'],
    [new HttpError(404, 'u'), 'missing'],
    [new ApiError('internal_api_error_DBQueryError', 'u'), 'down'],
    [new ApiError('ratelimited', 'u'), 'busy'],
    [new BadReplyError('text/html', 'u'), 'portal'],
    [new SyntaxError('Unexpected token <'), 'portal'],
    [new ArticleNotFoundError('x'), 'missing'],
    [abort, 'cancelled'],
    [timeout, 'timeout'],
    [new TypeError('Failed to fetch'), 'blocked'],
  ])('%s', (err, want) => {
    expect(classify(err, true)).toBe(want);
  });
  it('a network failure with the device offline is offline', () => {
    expect(classify(new TypeError('Failed to fetch'), false)).toBe('offline');
    expect(classify(timeout, false)).toBe('offline');
  });
});

describe('diagnose', () => {
  const fail = new TypeError('Failed to fetch');
  it('is blocked when our own server still answers', async () => {
    expect(await diagnose(fail, { onLine: () => true, reach: async () => true })).toBe('blocked');
  });
  it('is offline when nothing answers even though the browser says online', async () => {
    expect(await diagnose(fail, { onLine: () => true, reach: async () => false })).toBe('offline');
    expect(await diagnose(timeout, { onLine: () => true, reach: async () => false })).toBe('offline');
  });
  it('keeps a timeout a timeout when the connection is fine', async () => {
    expect(await diagnose(timeout, { onLine: () => true, reach: async () => true })).toBe('timeout');
  });
  it('does not probe for errors that already say why', async () => {
    const reach = vi.fn(async () => false);
    expect(await diagnose(new HttpError(500, 'u'), { onLine: () => true, reach })).toBe('down');
    expect(reach).not.toHaveBeenCalled();
  });
});

describe('backoffMs', () => {
  it('grows by 80 percent and stops at a minute', () => {
    expect(backoffMs('down', 0)).toBe(10_000);
    expect(backoffMs('down', 1)).toBe(18_000);
    expect(backoffMs('down', 9)).toBe(60_000);
  });
});

describe('Http failures', () => {
  it('a 200 that is not JSON is a bad reply, never cached', async () => {
    const fetch = vi.fn(async () => new Response('<html>sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const http = new Http({ fetch, storage: null });
    await expect(http.getJson('u')).rejects.toBeInstanceOf(BadReplyError);
    await expect(http.getJson('u')).rejects.toBeInstanceOf(BadReplyError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('a request that never answers times out', async () => {
    const fetch = vi.fn(
      (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))),
    );
    const http = new Http({ fetch: fetch as typeof globalThis.fetch, storage: null, timeoutMs: 20 });
    await expect(http.getJson('u')).rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('a caller abort stays an abort', async () => {
    const ctl = new AbortController();
    const fetch = vi.fn(
      (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))),
    );
    const http = new Http({ fetch: fetch as typeof globalThis.fetch, storage: null, timeoutMs: 5000 });
    const p = http.getJson('u', ctl.signal);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('RetryLoop', () => {
  afterEach(() => vi.useRealTimers());
  it('retries after the backoff, grows it, and heals when an attempt works', async () => {
    vi.useFakeTimers();
    let n = 0;
    const onHealed = vi.fn();
    const onFail = vi.fn();
    const loop = new RetryLoop({
      kind: 'down',
      attempt: async () => {
        if (++n < 3) throw new Error('still down');
      },
      onFail,
      onHealed,
    });
    loop.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(17_999);
    expect(onFail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onFail).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(onHealed).toHaveBeenCalledTimes(1);
    expect(n).toBe(3);
  });
  it('retries at once when told, and stops for good after stop()', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {
      throw new Error('no');
    });
    const loop = new RetryLoop({ kind: 'offline', attempt, onFail: () => undefined, onHealed: () => undefined });
    loop.start();
    await loop.retryNow(true);
    expect(attempt).toHaveBeenCalledTimes(1);
    loop.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    await loop.retryNow(true);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
