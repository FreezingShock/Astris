/**
 * Why Wikipedia could not be reached, sorted into the cases a reader can act on.
 * The data layer owns this because only it knows what its errors mean; the screens in src/modes only draw the result.
 */

/** Every way Wikipedia can be out of reach. A missing article is not one of them. */
export type Outage = 'offline' | 'blocked' | 'portal' | 'timeout' | 'busy' | 'down';

export type Diagnosis = Outage | 'missing' | 'cancelled';

/** The error classes the data layer throws, matched by name so this file needs no import cycle. */
function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

/** First guess from the error alone. `onLine` is navigator.onLine. TypeError and timeouts still need a probe to tell offline from blocked. */
export function classify(err: unknown, onLine: boolean): Diagnosis {
  const name = err instanceof Error ? err.name : '';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'ArticleNotFoundError') return 'missing';
  if (name === 'TimeoutError') return onLine ? 'timeout' : 'offline';
  if (name === 'BadReplyError' || name === 'SyntaxError') return 'portal';
  if (name === 'ApiError') {
    const code = String((err as { code?: unknown }).code ?? '');
    return /ratelimit|maxlag/i.test(code) ? 'busy' : 'down';
  }
  if (name === 'HttpError') {
    const status = statusOf(err) ?? 0;
    if (status === 404) return 'missing';
    if (status === 429) return 'busy';
    if (status === 401 || status === 403 || status === 407 || status === 451) return 'blocked';
    return 'down';
  }
  if (name === 'TypeError') return onLine ? 'blocked' : 'offline';
  return 'missing';
}

export interface Env {
  onLine: () => boolean;
  /** True when this site's own server answers. Wikipedia failing while this works means the network is picking what to let through. */
  reach: () => Promise<boolean>;
}

/** Ask the browser whether our own origin still answers, with a short limit. */
export async function reachOwnOrigin(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(new URL('favicon.svg?probe=' + Date.now(), document.baseURI), { cache: 'no-store', signal: ctl.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

const browserEnv: Env = { onLine: () => typeof navigator === 'undefined' || navigator.onLine !== false, reach: reachOwnOrigin };

/**
 * The full answer. A network failure or a timeout is checked against our own origin: if that fails too,
 * the device has no real connection ("offline"); if it works, Wikipedia in particular is being blocked or is slow.
 */
export async function diagnose(err: unknown, env: Env = browserEnv): Promise<Diagnosis> {
  const first = classify(err, env.onLine());
  if (first !== 'blocked' && first !== 'timeout') return first;
  return (await env.reach()) ? first : 'offline';
}

const BASE_MS: Record<Outage, number> = { offline: 20_000, blocked: 15_000, portal: 15_000, timeout: 6_000, busy: 15_000, down: 10_000 };
const CAP_MS = 60_000;

/** How long to wait before automatic try number `attempt` (counting from 0): the base for the case, growing by 80% each time, capped at a minute. */
export function backoffMs(kind: Outage, attempt: number): number {
  return Math.min(CAP_MS, Math.round(BASE_MS[kind] * 1.8 ** Math.max(0, attempt)));
}
