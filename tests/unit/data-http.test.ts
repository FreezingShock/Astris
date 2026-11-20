import { describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, DEFAULT_BACKOFF_MS, Http, HttpError, MAX_CONCURRENT, retryAfterMs, type StorageLike } from '../../src/data/http';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function fakeStorage(limit = Infinity): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (!map.has(k) && map.size >= limit) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

const noWait = (): Promise<void> => Promise.resolve();

describe('retryAfterMs', () => {
  it('reads seconds, dates, and falls back to five seconds', () => {
    expect(retryAfterMs('12', 0)).toBe(12_000);
    expect(retryAfterMs(new Date(30_000).toUTCString(), 10_000)).toBe(20_000);
    expect(retryAfterMs(null, 0)).toBe(DEFAULT_BACKOFF_MS);
    expect(retryAfterMs('soon', 0)).toBe(DEFAULT_BACKOFF_MS);
    expect(retryAfterMs('0', 0)).toBe(1000);
    expect(retryAfterMs('9999', 0)).toBe(60_000);
  });
});

describe('Http cache', () => {
  it('serves a repeat from memory and expires after an hour', async () => {
    let now = 1000;
    const fetch = vi.fn(async () => json({ n: fetch.mock.calls.length }));
    const http = new Http({ fetch, storage: null, now: () => now });
    expect(await http.getJson('u')).toEqual({ n: 1 });
    expect(await http.getJson('u')).toEqual({ n: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    now += CACHE_TTL_MS;
    expect(await http.getJson('u')).toEqual({ n: 2 });
  });

  it('shares the cache through storage, and skips it when asked for a fresh answer', async () => {
    const storage = fakeStorage();
    const fetch = vi.fn(async () => json({ ok: true }));
    await new Http({ fetch, storage }).getJson('u');
    expect(storage.map.size).toBe(1);
    const second = new Http({ fetch, storage });
    expect(await second.getJson('u')).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await second.getJson('u', undefined, true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clears its own entries when storage is full, and leaves other keys alone', async () => {
    const storage = fakeStorage(3);
    storage.map.set('someone-else', '1');
    const http = new Http({ fetch: async () => json(1), storage });
    for (const u of ['a', 'b', 'c', 'd']) await http.getJson(u);
    expect(storage.map.has('someone-else')).toBe(true);
    expect(storage.map.has('astris:c')).toBe(true);
    expect(storage.map.has('astris:a')).toBe(false);
  });

  it('survives corrupt storage', async () => {
    const storage = fakeStorage();
    storage.map.set('astris:u', '{not json');
    expect(await new Http({ fetch: async () => json(7), storage }).getJson('u')).toBe(7);
  });
});

describe('Http queue', () => {
  it('never runs more than three requests at once', async () => {
    let running = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const fetch = async (): Promise<Response> => {
      peak = Math.max(peak, ++running);
      await new Promise<void>((r) => gates.push(r));
      running--;
      return json(1);
    };
    const http = new Http({ fetch, storage: null });
    let done = 0;
    const all = Promise.all(Array.from({ length: 8 }, (_, i) => http.getJson('u' + i).then(() => done++)));
    for (let turn = 0; done < 8 && turn < 100; turn++) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(done).toBe(8);
    await all;
    expect(peak).toBe(MAX_CONCURRENT);
  });

  it('drops a queued request when its signal aborts, without fetching it', async () => {
    const gates: (() => void)[] = [];
    const fetch = vi.fn(async () => {
      await new Promise<void>((r) => gates.push(r));
      return json(1);
    });
    const http = new Http({ fetch, storage: null });
    const first = [http.getJson('a'), http.getJson('b'), http.getJson('c')];
    const ctl = new AbortController();
    const queued = http.getJson('d', ctl.signal);
    ctl.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    gates.forEach((g) => g());
    await Promise.all(first);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(http.getJson('e', ctl.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Http back-off', () => {
  it('waits for Retry-After on a 429, tells the owner, then retries', async () => {
    let now = 0;
    const waits: number[] = [];
    const onThrottle = vi.fn();
    const replies = [json({}, 429, { 'Retry-After': '7' }), json({ fine: true })];
    const http = new Http({
      fetch: async () => replies.shift() ?? json({}, 500),
      storage: null,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
      onThrottle,
    });
    expect(await http.getJson('u')).toEqual({ fine: true });
    expect(waits).toEqual([7000]);
    expect(onThrottle).toHaveBeenCalledWith(7000);
  });

  it('gives up after two retries, and does not cache the failure', async () => {
    const fetch = vi.fn(async () => json({}, 429));
    const http = new Http({ fetch, storage: null, wait: noWait });
    await expect(http.getJson('u')).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(http.getJson('u')).rejects.toMatchObject({ status: 429 });
  });

  it('throws other errors straight away', async () => {
    const fetch = vi.fn(async () => json({}, 404));
    await expect(new Http({ fetch, storage: null }).getJson('u')).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
