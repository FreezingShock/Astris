/**
 * The one door to the network for live data.
 * Caches every JSON response for an hour (memory, then sessionStorage), runs at most three requests at once,
 * and backs off on 429 or 503, honouring Retry-After. Limits follow mediawiki.org/wiki/Wikimedia_APIs/Rate_limits (2026).
 */

/** Wikimedia asks clients for three or fewer concurrent requests. */
export const MAX_CONCURRENT = 3;
/** How long a cached response stays fresh. */
export const CACHE_TTL_MS = 60 * 60 * 1000;
/** Wikimedia's guidance when a 429 carries no Retry-After: wait at least five seconds. */
export const DEFAULT_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60_000;
const MAX_RETRIES = 2;
const PREFIX = 'astris:';

/** A response that was not 2xx. `status` is the HTTP status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super('Request failed with status ' + status + ': ' + url);
    this.name = 'HttpError';
  }
}

/** A 200 reply whose body is an API error such as a database hiccup. It is never cached. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    url: string,
  ) {
    super('The API answered with an error (' + code + '): ' + url);
    this.name = 'ApiError';
  }
}

/** The part of Storage the cache needs, so tests can pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export interface HttpOptions {
  fetch?: typeof fetch;
  /** Second cache layer. Defaults to sessionStorage where it exists. Pass null for memory only. */
  storage?: StorageLike | null;
  now?: () => number;
  /** Resolves after `ms`, or rejects when the signal aborts. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called when the server asks for a pause, with the wait in milliseconds. */
  onThrottle?: (waitMs: number) => void;
}

interface Entry {
  t: number;
  v: unknown;
}

function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

function defaultWait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const done = (): void => {
      signal?.removeEventListener('abort', stop);
      resolve();
    };
    const id = setTimeout(done, ms);
    const stop = (): void => {
      clearTimeout(id);
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', stop, { once: true });
  });
}

function sessionStore(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // storage can be blocked outright
  }
}

/** Milliseconds to wait, from a Retry-After header holding seconds or an HTTP date. */
export function retryAfterMs(header: string | null, now: number): number {
  let ms = DEFAULT_BACKOFF_MS;
  if (header !== null && header.trim() !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) ms = seconds * 1000;
    else {
      const date = Date.parse(header);
      if (Number.isFinite(date)) ms = date - now;
    }
  }
  return Math.min(MAX_BACKOFF_MS, Math.max(1000, ms));
}

export class Http {
  private readonly fetcher: typeof fetch;
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly memory = new Map<string, Entry>();
  private readonly queue: (() => void)[] = [];
  private active = 0;
  private pausedUntil = 0;
  /** Set by the owner to hear about server-requested pauses. */
  onThrottle: ((waitMs: number) => void) | undefined;

  constructor(options: HttpOptions = {}) {
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.storage = options.storage === undefined ? sessionStore() : options.storage;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? defaultWait;
    this.onThrottle = options.onThrottle;
  }

  /** GET a URL as JSON. Cached for an hour unless `fresh` is set. */
  async getJson(url: string, signal?: AbortSignal, fresh = false): Promise<unknown> {
    if (signal?.aborted) throw abortError(signal);
    if (!fresh) {
      const hit = this.read(url);
      if (hit !== undefined) return hit;
    }
    await this.acquire(signal);
    try {
      const value = await this.request(url, signal);
      if (!fresh) this.write(url, value);
      return value;
    } finally {
      this.release();
    }
  }

  private async request(url: string, signal?: AbortSignal): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const pause = this.pausedUntil - this.now();
      if (pause > 0) await this.wait(pause, signal);
      const res = await this.fetcher(url, signal ? { signal } : undefined);
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const err = typeof body === 'object' && body !== null ? (body as { error?: { code?: unknown } }).error : undefined;
        if (err) throw new ApiError(typeof err.code === 'string' ? err.code : 'unknown', url);
        return body;
      }
      if ((res.status !== 429 && res.status !== 503) || attempt >= MAX_RETRIES) throw new HttpError(res.status, url);
      // Back off for everyone, not only this request, and wait longer each time it repeats.
      const waitMs = Math.min(MAX_BACKOFF_MS, retryAfterMs(res.headers.get('Retry-After'), this.now()) * 2 ** attempt);
      this.pausedUntil = Math.max(this.pausedUntil, this.now() + waitMs);
      this.onThrottle?.(waitMs);
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = (): void => {
        signal?.removeEventListener('abort', stop);
        this.active++;
        resolve();
      };
      const stop = (): void => {
        const i = this.queue.indexOf(start);
        if (i >= 0) this.queue.splice(i, 1);
        reject(abortError(signal));
      };
      signal?.addEventListener('abort', stop, { once: true });
      this.queue.push(start);
    });
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }

  private read(url: string): unknown {
    let entry = this.memory.get(url);
    if (!entry && this.storage) {
      try {
        const raw = this.storage.getItem(PREFIX + url);
        if (raw !== null) entry = JSON.parse(raw) as Entry;
      } catch {
        entry = undefined; // unreadable storage is the same as a miss
      }
    }
    if (!entry || typeof entry.t !== 'number') return undefined;
    if (this.now() - entry.t >= CACHE_TTL_MS) {
      this.memory.delete(url);
      this.drop(PREFIX + url);
      return undefined;
    }
    this.memory.set(url, entry);
    return entry.v;
  }

  private write(url: string, value: unknown): void {
    const entry: Entry = { t: this.now(), v: value };
    this.memory.set(url, entry);
    if (!this.storage) return;
    const raw = JSON.stringify(entry);
    try {
      this.storage.setItem(PREFIX + url, raw);
    } catch {
      // Out of room: clear our own entries and try once more. Memory still holds everything.
      this.clearStorage();
      try {
        this.storage.setItem(PREFIX + url, raw);
      } catch {
        // still too big for storage; memory is enough
      }
    }
  }

  private drop(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // nothing to do
    }
  }

  private clearStorage(): void {
    const store = this.storage;
    if (!store) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    } catch {
      // nothing to do
    }
  }
}
