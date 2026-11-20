/** How long the map rests on each article while it drifts. */
export const DRIFT_MS = 6000;

/** The card shown while the map drifts. */
export const DRIFT_HTML =
  "<div class='line'>Drifting</div><div class='stats'><span>the map travels on its own · click a star to take over</span><button class='lk' type='button' id='quit'>Stop</button></div>";

/** The next stop for Drift: a neighbour not seen recently, else any neighbour, else null. Closer ties come up more often. `rand` returns a number in [0, 1). */
export function nextStop(neighbours: string[], recent: string[], rand: () => number = Math.random): string | null {
  const fresh = neighbours.filter((t) => !recent.includes(t));
  const pool = fresh.length ? fresh : neighbours;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() ** 2 * pool.length))] ?? null;
}
