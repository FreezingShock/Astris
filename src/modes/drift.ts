/** How long the map rests on each article while it drifts. */
export const DRIFT_MS = 6000;

/** The next stop for Drift: a neighbour not seen recently, else any neighbour, else null. `rand` returns a number in [0, 1). */
export function nextStop(neighbours: string[], recent: string[], rand: () => number = Math.random): string | null {
  const fresh = neighbours.filter((t) => !recent.includes(t));
  const pool = fresh.length ? fresh : neighbours;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))] ?? null;
}
