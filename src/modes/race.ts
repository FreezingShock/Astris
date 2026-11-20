import type { DataProvider } from '../types';
import { clock, esc } from '../lib';

/** The furthest a par search looks before giving up. */
export const PAR_DEPTH = 4;

export interface Race {
  start: string;
  target: string;
  clicks: number;
  /** Fewest clicks from start to target, or -1 when none was found within PAR_DEPTH. */
  par: number;
  t0: number;
  time: number;
  done: boolean;
}

/**
 * Fewest clicks from one article to another: a breadth-first search over neighbours.
 * Returns -1 when the target is further than maxDepth or cannot be reached.
 */
export async function par(provider: DataProvider, from: string, to: string, maxDepth = PAR_DEPTH): Promise<number> {
  const depth = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (t === undefined) break;
    const d = depth.get(t) ?? 0;
    if (t === to) return d;
    if (d >= maxDepth) continue;
    for (const n of await provider.neighbours(t)) {
      if (!depth.has(n)) {
        depth.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return -1;
}

/** Pick a random pair that is three or four clicks apart. */
export async function randomPair(provider: DataProvider): Promise<{ start: string; target: string; par: number }> {
  let start: string;
  let target: string;
  let d: number;
  let n = 0;
  do {
    start = await provider.random();
    target = await provider.random();
    d = start === target ? -1 : await par(provider, start, target);
    n++;
  } while ((d < 3 || d > 4) && n < 200);
  return { start, target, par: d };
}

function parText(race: Race): string {
  return race.par < 0 ? 'par unknown' : 'par ' + race.par;
}

/** The status card at the top of the map while a race runs. */
export function hudHtml(race: Race): string {
  return race.done
    ? "<div class='line'>Arrived at <em>" +
        esc(race.target) +
        "</em></div><div class='stats'><span>" +
        race.clicks +
        (race.clicks === 1 ? ' click' : ' clicks') +
        '</span><span>' +
        clock(race.time) +
        '</span><span>' +
        parText(race) +
        "</span><button class='lk' type='button' id='again'>Race again</button><button class='lk' type='button' id='quit'>Keep exploring</button></div>"
    : "<div class='line'>" +
        esc(race.start) +
        ' → <em>' +
        esc(race.target) +
        "</em></div><div class='stats'><span id='rc'>" +
        race.clicks +
        " clicks</span><span id='rt'>00:00</span><span>" +
        parText(race) +
        "</span><button class='lk' type='button' id='again'>New race</button><button class='lk' type='button' id='quit'>Quit</button></div>";
}
