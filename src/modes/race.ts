import type { DataProvider } from '../types';
import { clock, esc } from '../lib';
import { dayLabel, type DailyResult } from './daily';
import { DEFAULT_LEVEL, LEVEL_LABEL, levelPickerHtml, miss, rate, walkSteps, type Level } from './difficulty';
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
  /** How hard this pair rates, once par is known. */
  level?: Level;
  /** One line about the target article, once it has been fetched. */
  hint?: string;
  /** Set when this is the daily race: the day it belongs to. */
  day?: number;
  /** The reader's best finish for that day, once they have one. */
  best?: DailyResult;
  /** Set for the hard daily: the hint about the target stays hidden. */
  hard?: boolean;
  /** Days in a row finished, and the last four weeks, once the daily is done. */
  streak?: number;
  calendar?: boolean[];
}

/** A fresh race, with the clock started. */
export function beginRace(start: string, target: string, par: number | null, now: number, day?: number, hard = false): Race {
  const race: Race = { start, target, clicks: 0, par, t0: now, time: 0, done: false };
  if (day !== undefined) race.day = day;
  if (hard) race.hard = true;
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
  level: Level;
}

/** How many neighbours an article has, or 0 when it cannot be asked for. Asked once per article. */
export async function linksOf(provider: DataProvider, title: string): Promise<number> {
  return (await graphOf(provider).neighbours(title)).length;
}

/** The level a pair rates, from its par and how well linked the target is. Empty par (-1) rates nothing. */
export async function levelOf(provider: DataProvider, target: string, par: number): Promise<Level | undefined> {
  return par < 0 ? undefined : rate(par, await linksOf(provider, target));
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
 * Pick a random pair of the wanted level. A walk of the right length proves a chain exists and one small search
 * looks for a shortcut; the pair is then rated from its par and the target's links. The first pair that rates
 * as asked wins, and when none does in a few tries the closest one is used.
 * A pair usually costs about a dozen neighbour requests, not a search per candidate.
 */
export async function randomPair(provider: DataProvider, rand: () => number = Math.random, level: Level = DEFAULT_LEVEL): Promise<Pair> {
  let best: (Pair & { off: number }) | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const path = await wander(provider, walkSteps(level, rand), rand);
    const start = path[0] ?? '';
    const target = path[path.length - 1] ?? '';
    if (path.length < 2) continue;
    const short = await route(graphOf(provider), start, target, { maxDepth: path.length - 2, budget: CHECK_BUDGET, beam: PAR_BEAM });
    const found = short ? short.length - 1 : path.length - 1;
    const links = await linksOf(provider, target);
    const pair = { start, target, par: found, level: rate(found, links), off: miss(level, found, links) + (level !== 'easy' && found < 3 ? 2 : 0) };
    if (pair.off === 0) return pair;
    if (!best || pair.off < best.off || (pair.off === best.off && level !== 'easy' && pair.par > best.par)) best = pair;
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
  const text = race.par === null ? 'finding par…' : race.par < 0 ? 'par unknown' : 'par ' + race.par;
  return race.level ? text + ' · ' + LEVEL_LABEL[race.level].toLowerCase() : text;
}

/** The status card while a random pair is being picked. */
export const PICKING_HTML = "<div class='line'>Picking two articles…</div><div class='stats'><button class='lk' type='button' id='quit'>Cancel</button></div>";

const button = (id: string, text: string): string => "<button class='lk' type='button' id='" + id + "'>" + text + '</button>';

/** The status card at the top of the map while a race runs. */
export function hudHtml(race: Race, level: Level = DEFAULT_LEVEL): string {
  const daily = race.day !== undefined;
  const day = race.day === undefined ? '' : "<div class='day'>Daily constellation · " + esc(dayLabel(race.day)) + (race.hard ? ' · hard' : '') + '</div>';
  if (!race.done)
    return (
      day +
      "<div class='line'>" +
      esc(race.start) +
      ' → <em>' +
      esc(race.target) +
      '</em></div>' +
      (race.hint && !race.hard ? "<div class='hint'>" + esc(race.hint) + '</div>' : '') +
      "<div class='stats'><span id='rc'>" +
      race.clicks +
      " clicks</span><span id='rt'>00:00</span><span id='rp'>" +
      parText(race) +
      '</span>' +
      (daily ? button('retry', 'Restart') + button('dtoggle', race.hard ? 'Normal version' : 'Hard version') : button('again', 'New race')) +
      button('quit', 'Quit') +
      '</div>' +
      (daily ? '' : "<div class='stats'>" + levelPickerHtml(level) + '</div>')
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
    (daily ? dailyExtras(race) : '') +
    button('retry', 'Same race') +
    button('again', daily ? 'Random race' : 'New race') +
    button('quit', 'Keep exploring') +
    '</div>' +
    (daily ? '' : "<div class='stats'>" + levelPickerHtml(level) + '</div>')
  );
}

/** After a daily finish: the streak, the last four weeks as a calendar, and the share and hard buttons. */
function dailyExtras(race: Race): string {
  const days = race.calendar ?? [];
  const cells = days.map((on, i) => "<i class='" + (on ? 'on' : '') + (i === days.length - 1 ? ' today' : '') + "'></i>").join('');
  const n = race.streak ?? 0;
  return (
    "<div class='streak'><span>" +
    n +
    (n === 1 ? ' day' : ' days') +
    " in a row</span><span class='cal' role='img' aria-label='" +
    days.filter(Boolean).length +
    ' of the last ' +
    days.length +
    " days finished'>" +
    cells +
    '</span></div>' +
    button('share', 'Share result') +
    button('dtoggle', race.hard ? 'Normal version' : 'Hard version')
  );
}
