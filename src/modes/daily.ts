import { hash } from '../lib';

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
}

/** The one race pair for a day. It depends on the day alone, so it is the same for everyone. */
export function dailyPair(day: number = dayOf()): DailyPair {
  const groups = DAILY_POOL.length;
  const a = hash('daily start ' + day) % groups;
  const b = (a + 1 + (hash('daily end ' + day) % (groups - 1))) % groups;
  const pick = (g: number, salt: string): string => {
    const list = DAILY_POOL[g] ?? [];
    return list[hash(salt + day) % list.length] ?? '';
  };
  return { day, start: pick(a, 'from '), target: pick(b, 'to ') };
}

export interface DailyResult {
  clicks: number;
  time: number;
}

const key = (day: number): string => 'astris:daily:' + day;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** This browser's storage, or nothing where it is blocked. */
function browserStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The reader's best finish for a day, kept in this browser only. Null when there is none or storage is off. */
export function bestDaily(day: number, store: Pick<Store, 'getItem'> | undefined = browserStore()): DailyResult | null {
  try {
    const raw: unknown = JSON.parse(store?.getItem(key(day)) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const { clicks, time } = raw as Record<string, unknown>;
    return typeof clicks === 'number' && typeof time === 'number' ? { clicks, time } : null;
  } catch {
    return null;
  }
}

/** Keep a finish when it beats the stored one: fewer clicks, or the same clicks in less time. Returns the best. */
export function saveDaily(day: number, result: DailyResult, store: Store | undefined = browserStore()): DailyResult {
  const old = bestDaily(day, store);
  if (old && (old.clicks < result.clicks || (old.clicks === result.clicks && old.time <= result.time))) return old;
  try {
    store?.setItem(key(day), JSON.stringify({ clicks: result.clicks, time: result.time }));
  } catch {
    // Storage is full or blocked: the finish still shows, it is just not remembered.
  }
  return result;
}
