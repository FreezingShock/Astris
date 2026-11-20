import type { DataProvider } from '../types';
import { clock, esc } from '../lib';
import { graphOf, route } from './graph';

/** The furthest a par search looks before giving up. */
export const PAR_DEPTH = 4;
/** The most articles one par search may ask the provider for. Each can cost several requests on live data. */
export const PAR_BUDGET = 24;
/** The smaller budget used to double-check a random pair. */
const CHECK_BUDGET = 8;
/** The most articles one walk may ask for while looking for a pair. */
const WALK_BUDGET = 16;

export interface Race {
  start: string;
  target: string;
  clicks: number;
  /** Fewest clicks known from start to target, -1 when none was found, or null while the search runs. */
  par: number | null;
  t0: number;
  time: number;
  done: boolean;
}

/** A fresh race, with the clock started. */
export function beginRace(start: string, target: string, par: number | null, now: number): Race {
  return { start, target, clicks: 0, par, t0: now, time: 0, done: false };
}

/** Count one click. Returns true when that click reached the target and finished the race. */
export function stepRace(race: Race, title: string, now: number): boolean {
  if (race.done) return false;
  race.clicks++;
  if (title !== race.target) return false;
  race.done = true;
  race.time = now - race.t0;
  return true;
}

/**
 * Fewest clicks found from one article to another, or -1 when no chain was found within maxDepth
 * and the request budget. A par that is returned always belongs to a chain that exists.
 */
export async function par(provider: DataProvider, from: string, to: string, maxDepth = PAR_DEPTH, budget = PAR_BUDGET): Promise<number> {
  const chain = await route(graphOf(provider), from, to, { maxDepth, budget });
  return chain ? chain.length - 1 : -1;
}

export interface Pair {
  start: string;
  target: string;
  par: number;
}

/**
 * Walk a few clicks out from a random article and race to wherever the walk ends.
 * Each step avoids everything an earlier step could already reach, so the walk never doubles back.
 * A step that leads nowhere new is undone and another is tried, until the request budget runs out.
 */
async function wander(provider: DataProvider, steps: number, rand: () => number): Promise<string[]> {
  const graph = graphOf(provider);
  let asked = 0;
  let best: string[] = [];
  const extend = async (path: string[], near: ReadonlySet<string>): Promise<boolean> => {
    if (path.length > best.length) best = path;
    if (path.length > steps) return true;
    const here = path[path.length - 1] ?? '';
    if (!graph.has(here) && asked++ >= WALK_BUDGET) return false;
    const all = await graph.neighbours(here);
    const fresh = all.filter((n) => !near.has(n));
    const wider = new Set(near);
    for (const n of all) wider.add(n);
    while (fresh.length) {
      const [next] = fresh.splice(Math.floor(rand() * fresh.length), 1);
      if (next !== undefined && (await extend(path.concat(next), wider))) return true;
      if (asked >= WALK_BUDGET) return false;
    }
    return false;
  };
  const start = await provider.random();
  await extend([start], new Set([start]));
  return best;
}

/**
 * Pick a random pair three or four clicks apart. A pair usually costs about a dozen neighbour requests,
 * not a search per candidate: the walk itself proves a chain exists, and one small search looks for a shortcut.
 */
export async function randomPair(provider: DataProvider, rand: () => number = Math.random): Promise<Pair> {
  let best: Pair | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = await wander(provider, rand() < 0.5 ? 3 : 4, rand);
    const start = path[0] ?? '';
    const target = path[path.length - 1] ?? '';
    if (path.length < 2) continue;
    const short = await route(graphOf(provider), start, target, { maxDepth: path.length - 2, budget: CHECK_BUDGET });
    const pair = { start, target, par: short ? short.length - 1 : path.length - 1 };
    if (pair.par >= 3) return pair;
    if (!best || pair.par > best.par) best = pair;
  }
  if (best) return best;
  throw new Error('No race could be picked.');
}

function parText(race: Race): string {
  return race.par === null ? 'finding par…' : race.par < 0 ? 'par unknown' : 'par ' + race.par;
}

/** The status card while a random pair is being picked. */
export const PICKING_HTML = "<div class='line'>Picking two articles…</div>";

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
        "</span><button class='lk' type='button' id='retry'>Same race</button><button class='lk' type='button' id='again'>New race</button><button class='lk' type='button' id='quit'>Keep exploring</button></div>"
    : "<div class='line'>" +
        esc(race.start) +
        ' → <em>' +
        esc(race.target) +
        "</em></div><div class='stats'><span id='rc'>" +
        race.clicks +
        " clicks</span><span id='rt'>00:00</span><span id='rp'>" +
        parText(race) +
        "</span><button class='lk' type='button' id='again'>New race</button><button class='lk' type='button' id='quit'>Quit</button></div>";
}
