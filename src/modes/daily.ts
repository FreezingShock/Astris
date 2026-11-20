import { hash } from '../lib';
import { dailyBest, saveDailyBest } from './stats';

/**
 * The articles a daily race can start or end at, grouped so the two ends come from different subjects.
 * Every title is a long-standing English Wikipedia article and is also in the sample set.
 */
export const DAILY_POOL: readonly (readonly string[])[] = [
  ['Brutalist architecture', 'Bauhaus', 'Gothic architecture', 'Art Deco', 'Frank Lloyd Wright', 'Le Corbusier', 'Zaha Hadid', 'Skyscraper'],
  ['Bridge', 'Dam', 'Reinforced concrete', 'Tunnel', 'Aqueduct', 'Suspension bridge', 'Zoning', 'Jane Jacobs'],
  ['Black hole', 'Neutron star', 'Galaxy', 'Milky Way', 'Supernova', 'Exoplanet', 'Nebula', 'Dark matter', 'Big Bang', 'Solar System'],
  ['Jazz', 'Blues', 'Synthesizer', 'Punk rock', 'Guitar', 'Drum machine', 'Shoegaze', 'Ambient music'],
  ['DNA', 'Evolution', 'Photosynthesis', 'Mitochondrion', 'Ecosystem', 'Natural selection', 'Protein', 'Enzyme', 'Neuron'],
  ['Stoicism', 'Existentialism', 'Epistemology', 'Ethics', 'Plato', 'Aristotle', 'Nihilism', 'Utilitarianism', 'Metaphysics', 'Logic'],
  ['Algorithm', 'Search engine', 'Trie', 'Hash table', 'Web crawler', 'Inverted index', 'Graph theory', 'PageRank', 'Database'],
  ['Roman Empire', 'Renaissance', 'Industrial Revolution', 'Silk Road', 'Ancient Egypt', 'Byzantine Empire', 'Cold War', 'Printing press', 'Bronze Age'],
  ['Pacific Ocean', 'Mojave Desert', 'Amazon rainforest', 'Sahara', 'Himalayas', 'Nile', 'Tokyo', 'Paris', 'Antarctica'],
  ['Procedural generation', 'Pixel art', 'Game engine', 'Roguelike', 'Level design', 'ASCII art'],
];

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day a moment falls on, counted in whole UTC days, so every visitor shares one day. */
export function dayOf(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS);
}

/** A short name for a day, such as "20 Nov". */
export function dayLabel(day: number): string {
  const d = new Date(day * DAY_MS);
  return d.getUTCDate() + ' ' + (MONTHS[d.getUTCMonth()] ?? '');
}

export interface DailyPair {
  day: number;
  start: string;
  target: string;
  hard: boolean;
}

/**
 * The race pair for a day. It depends on the day alone, so it is the same for everyone.
 * The hard variant is a second pair drawn with its own seed that never repeats the normal pair, and the race hides the target's hint.
 */
export function dailyPair(day: number = dayOf(), hard = false): DailyPair {
  const groups = DAILY_POOL.length;
  const seed = hard ? 'hard ' : '';
  const a = hash(seed + 'daily start ' + day) % groups;
  const b = (a + 1 + (hash(seed + 'daily end ' + day) % (groups - 1))) % groups;
  const pick = (g: number, salt: string): string => {
    const list = DAILY_POOL[g] ?? [];
    return list[hash(seed + salt + day) % list.length] ?? '';
  };
  const pair = { day, start: pick(a, 'from '), target: pick(b, 'to '), hard };
  if (!hard) return pair;
  const normal = dailyPair(day);
  // Rare collision with the normal pair: swap the ends so the two never match.
  return pair.start === normal.start && pair.target === normal.target ? { ...pair, start: pair.target, target: pair.start } : pair;
}

export interface DailyResult {
  clicks: number;
  time: number;
  /** Par for the pair when it was finished, if it was known. */
  par?: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** This browser's storage, or nothing where it is blocked. */
function browserStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The reader's best finish for a day, kept in this browser's stats record. Null when there is none or storage is off. */
export function bestDaily(day: number, store: Pick<Store, 'getItem'> | undefined = browserStore(), hard = false): DailyResult | null {
  return dailyBest(day, hard, store);
}

/** Keep a finish when it beats the stored one: fewer clicks, or the same clicks in less time. Returns the best. */
export function saveDaily(day: number, result: DailyResult, store: Store | undefined = browserStore(), hard = false): DailyResult {
  return saveDailyBest(day, result, hard, store);
}

/** True when the reader finished either version of that day's race. */
export function played(day: number, store: Pick<Store, 'getItem'> | undefined = browserStore()): boolean {
  return bestDaily(day, store) !== null || bestDaily(day, store, true) !== null;
}

/**
 * Days in a row the reader has finished a daily race, counting back from today.
 * A day not finished yet does not break the run: it is counted from yesterday until today is done.
 */
export function streak(today: number, store: Pick<Store, 'getItem'> | undefined = browserStore()): number {
  let day = played(today, store) ? today : today - 1;
  let n = 0;
  while (played(day, store)) {
    n++;
    day--;
  }
  return n;
}

/** Whether each of the last `days` days was finished, oldest first, ending today. */
export function recent(today: number, days = 28, store: Pick<Store, 'getItem'> | undefined = browserStore()): boolean[] {
  return Array.from({ length: days }, (_, i) => played(today - (days - 1) + i, store));
}

/** The most squares a shared row shows. */
const GRID_MAX = 20;

/** One square per click, a star on the click that arrived. Blue is on par or unknown, orange is over par, green is a shortcut under par. */
export function resultGrid(clicks: number, par: number | undefined): string {
  const under = par !== undefined && par > 0 && clicks < par;
  const squares = Array.from({ length: Math.max(0, Math.min(clicks, GRID_MAX) - 1) }, (_, i) => (under ? '🟩' : par !== undefined && par > 0 && i >= par - 1 ? '🟧' : '🟦'));
  return squares.join('') + (clicks > GRID_MAX ? '…' : '') + '⭐';
}

/** The text a reader shares after a daily race. It holds the numbers and a grid but never names the two articles. */
export function shareText(day: number, hard: boolean, result: DailyResult, url: string): string {
  const par = result.par !== undefined && result.par > 0 ? ' · par ' + result.par : '';
  const m = Math.floor(result.time / 60000);
  const sec = Math.floor((result.time % 60000) / 1000);
  return [
    'Astris Daily · ' + dayLabel(day) + (hard ? ' (hard)' : ''),
    result.clicks + (result.clicks === 1 ? ' click' : ' clicks') + par + ' · ' + m + ':' + String(sec).padStart(2, '0'),
    resultGrid(result.clicks, result.par),
    url,
  ].join('\n');
}
