/** Small pure helpers shared by every module. No DOM, no state. */

/** FNV-1a, 32 bit. Gives every title a stable pseudo-random number. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escape text for use inside HTML. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ENTITIES[c] ?? c);
}

/** Ease-out cubic, clamped to 0..1. */
export function ease(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
}

/** Ease-out with a slight overshoot, clamped to 0..1 at the ends. */
export function spring(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

/** "m:ss" under ten minutes with a leading zero, as the race clock shows it. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return (s < 600 ? '0' : '') + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
