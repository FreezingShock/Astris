import type { DataProvider } from '../types';
import { clock, esc } from '../lib';
import { dayLabel, type DailyResult } from './daily';
import { starsText } from './score';
import type { Recorded } from './stats';
import { solve, type LinkSource, type Solution } from '../data';
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
  /** False when par is only the best chain found so far, not proven shortest. */
  parExact?: boolean;
  /** The best chain, shown once the race is won. */
  route?: string[];
  t0: number;
  time: number;
  done: boolean;
  /** Hints the reader has used. Whatever gives a hint raises this; each one costs points. */
  hints: number;
  /** The score and personal bests of the finished run. */
  result?: Recorded;
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
  const race: Race = { start, target, clicks: 0, par, hints: 0, t0: now, time: 0, done: false };
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

/** Expansions a solver run may make on a provider with a cheap link list. Each costs one to four requests. */
export const SOLVE_BUDGET = 24;
/** The longest chain the solver looks for. */
export const SOLVE_DEPTH = 6;
/** Providers with no cheap link list are the local ones (sample data and test fakes), so they get a roomy budget. */
const LOCAL_BUDGET = 200;

export interface ParResult {
  /** Clicks of the best chain found, or -1 when none was found. */
  par: number;
  /** That chain, start to target. Every step in it is a click the map offers. */
  route: string[] | null;
  /** True when no shorter chain exists. When false, `par` is only an upper bound and `lower` is the proven floor. */
  exact: boolean;
  /** No chain shorter than this exists. */
  lower: number;
  /** How many articles the solver read. */
  expansions: number;
}

const hasLinks = (p: DataProvider): p is DataProvider & LinkSource => typeof (p as Partial<LinkSource>).links === 'function';

/**
 * The real par between two articles, with proof. A bidirectional search reads cheap link lists and finds a shortest
 * chain; the chain is then checked step by step against the stars the map would really show, and a step the map
 * does not offer is dropped and the search runs again. When the budget runs out before a chain turns up, the small
 * beam search supplies a chain that is achievable but not proven shortest (exact is false), next to the proven floor.
 */
export async function solvePar(provider: DataProvider, from: string, to: string, budget?: number): Promise<ParResult> {
  const graph = graphOf(provider);
  const source: LinkSource = hasLinks(provider) ? provider : { links: async (t) => ({ titles: await graph.neighbours(t), complete: true }) };
  const banned = new Set<string>();
  let expansions = 0;
  let sol: Solution | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    sol = await solve(source, from, to, {
      maxDepth: SOLVE_DEPTH,
      budget: budget ?? (hasLinks(provider) ? SOLVE_BUDGET : LOCAL_BUDGET),
      banned: (a, b) => banned.has(a + '\n' + b),
    });
    expansions += sol.expansions;
    if (!sol.path) break;
    let ok = true;
    for (let i = 0; i + 1 < sol.path.length && ok; i++) {
      const a = sol.path[i] ?? '';
      const b = sol.path[i + 1] ?? '';
      if (!(await graph.neighbours(a)).includes(b)) {
        banned.add(a + '\n' + b);
        ok = false;
      }
    }
    if (ok) return { par: sol.length, route: sol.path, exact: sol.exact, lower: sol.lower, expansions };
    sol = null;
  }
  const chain = await route(graph, from, to, { maxDepth: PAR_DEPTH, budget: PAR_BUDGET, beam: PAR_BEAM });
  return { par: chain ? chain.length - 1 : -1, route: chain, exact: false, lower: sol?.lower ?? 1, expansions };
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
  return race.par === null ? 'finding par…' : race.par < 0 ? 'par unknown' : (race.parExact === false ? 'par ≤ ' : 'par ') + race.par;
}

/** The score line of a finished race: stars, points, any personal best and the streak. */
export function scoreHtml(race: Race): string {
  const r = race.result;
  if (!r) return '';
  const badges: string[] = [];
  if (r.records.points) badges.push('best score for this pair');
  if (r.records.clicks) badges.push('fewest clicks yet');
  if (r.records.time) badges.push('fastest yet');
  const rating = r.score.stars === null ? '' : "<span class='stars' aria-label='" + r.score.stars + " of 3 stars'>" + starsText(r.score.stars) + '</span> ';
  return (
    "<div class='score'>" +
    rating +
    '<b>' +
    r.score.points +
    ' points</b>' +
    (r.score.hintCost ? ' <span>(hints cost ' + r.score.hintCost + ')</span>' : '') +
    (badges.length ? " <span class='pb'>New personal best: " + esc(badges.join(', ')) + '</span>' : '') +
    "</div><div class='score'><span>" +
    r.streak +
    (r.streak === 1 ? ' day' : ' days') +
    ' in a row</span> · <a href="/stats" data-go="stats">Your stats</a></div>'
  );
}

/** The status card while a random pair is being picked. */
export const PICKING_HTML = "<div class='line'>Picking two articles…</div><div class='stats'><button class='lk' type='button' id='quit'>Cancel</button></div>";

const button = (id: string, text: string): string => "<button class='lk' type='button' id='" + id + "'>" + text + '</button>';

/** The status card at the top of the map while a race runs. */
export function hudHtml(race: Race): string {
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
      '</div>'
    );
  const best = race.best ? '<span>your best today ' + race.best.clicks + (race.best.clicks === 1 ? ' click' : ' clicks') + ' in ' + clock(race.best.time) + '</span>' : '';
  return (
    day +
    "<div class='line'>Arrived at <em>" +
    esc(race.target) +
    '</em></div>' +
    (verdict(race.clicks, race.par) ? "<div class='line'>" + esc(verdict(race.clicks, race.par)) + '</div>' : '') +
    scoreHtml(race) +
    (race.route && race.route.length > 1
      ? "<div class='hint'>" + (race.parExact === false ? 'Shortest route found: ' : 'Shortest route: ') + race.route.map(esc).join(' → ') + '</div>'
      : '') +
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
    '</div>'
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
