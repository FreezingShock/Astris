import type { DataProvider } from '../types';
import { clock, esc } from '../lib';
import { dayLabel, type DailyResult } from './daily';
import { graphOf, route } from './graph';

/** The furthest a par search looks before giving up. */
export const PAR_DEPTH = 4;
/**
 * The most articles one par search may ask the provider for. On live data an article costs about
 * seven requests and a browser is allowed 200 a minute, so a search has to stay small.
 */
export const PAR_BUDGET = 10;
/** How many new articles a par search asks for at each step, strongest ties first. */
export const PAR_BEAM = 3;
/** The smaller budget used to look for a shortcut between a random pair. */
const CHECK_BUDGET = 3;
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
  /** Set when this is the daily race: the day it belongs to. */
  day?: number;
  /** The reader's best finish for that day, once they have one. */
  best?: DailyResult;
}

/** A fresh race, with the clock started. */
export function beginRace(start: string, target: string, par: number | null, now: number, day?: number): Race {
  const race: Race = { start, target, clicks: 0, par, t0: now, time: 0, done: false };
  if (day !== undefined) race.day = day;
  return race;
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
 * and the request budget. A par that is returned always belongs to a chain that exists. The search follows
 * the strongest ties only, so on a big graph a shorter chain can exist; pass Infinity as the beam to rule that out.
 */
export async function par(provider: DataProvider, from: string, to: string, maxDepth = PAR_DEPTH, budget = PAR_BUDGET, beam = PAR_BEAM): Promise<number> {
  const chain = await route(graphOf(provider), from, to, { maxDepth, budget, beam });
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
    const short = await route(graphOf(provider), start, target, { maxDepth: path.length - 2, budget: CHECK_BUDGET, beam: PAR_BEAM });
    const pair = { start, target, par: short ? short.length - 1 : path.length - 1 };
    if (pair.par >= 3) return pair;
    if (!best || pair.par > best.par) best = pair;
  }
  if (best) return best;
  throw new Error('No race could be picked.');
}

/** How a finished race compares with par, in words. Empty while par is unknown. */
export function verdict(clicks: number, par: number | null): string {
  if (par === null || par < 0) return '';
  if (clicks === par) return 'Par!';
  if (clicks < par) return par - clicks + ' under par, a shortcut';
  return clicks - par + ' over par';
}

function parText(race: Race): string {
  return race.par === null ? 'finding par…' : race.par < 0 ? 'par unknown' : 'par ' + race.par;
}

/** The status card while a random pair is being picked. */
export const PICKING_HTML = "<div class='line'>Picking two articles…</div><div class='stats'><button class='lk' type='button' id='quit'>Cancel</button></div>";

const button = (id: string, text: string): string => "<button class='lk' type='button' id='" + id + "'>" + text + '</button>';

/** The status card at the top of the map while a race runs. */
export function hudHtml(race: Race): string {
  const daily = race.day !== undefined;
  const day = race.day === undefined ? '' : "<div class='day'>Daily constellation · " + esc(dayLabel(race.day)) + '</div>';
  if (!race.done)
    return (
      day +
      "<div class='line'>" +
      esc(race.start) +
      ' → <em>' +
      esc(race.target) +
      "</em></div><div class='stats'><span id='rc'>" +
      race.clicks +
      " clicks</span><span id='rt'>00:00</span><span id='rp'>" +
      parText(race) +
      '</span>' +
      (daily ? button('retry', 'Restart') : button('again', 'New race')) +
      button('quit', 'Quit') +
      '</div>'
    );
  const best = race.best ? '<span>your best today ' + race.best.clicks + (race.best.clicks === 1 ? ' click' : ' clicks') + ' in ' + clock(race.best.time) + '</span>' : '';
  return (
    day +
    "<div class='line'>Arrived at <em>" +
    esc(race.target) +
    '</em></div>' +
    (verdict(race.clicks, race.par) ? "<div class='line'>" + esc(verdict(race.clicks, race.par)) + '</div>' : '') +
    "<div class='stats'><span>" +
    race.clicks +
    (race.clicks === 1 ? ' click' : ' clicks') +
    '</span><span>' +
    clock(race.time) +
    '</span><span>' +
    parText(race) +
    '</span>' +
    best +
    button('retry', 'Same race') +
    button('again', daily ? 'Random race' : 'New race') +
    button('quit', 'Keep exploring') +
    '</div>'
  );
}
