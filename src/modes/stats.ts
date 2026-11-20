import { scoreRun, type Score } from './score';

/** One finished run, as it is kept. */
export interface RunRecord {
  day: number;
  mode: 'race' | 'daily';
  start: string;
  target: string;
  clicks: number;
  par: number | null;
  time: number;
  hints: number;
  points: number;
  stars: 1 | 2 | 3 | null;
}

export interface Stats {
  version: 1;
  runs: number;
  /** Total points and stars across every run kept. */
  points: number;
  stars: number;
  /** Consecutive days with at least one finished run, as of the last run. */
  streak: number;
  longest: number;
  lastDay: number | null;
  /** Personal bests across all runs. */
  bestPoints: number;
  fewestClicks: number | null;
  fastest: number | null;
  threeStar: number;
  /** The best points per pair, so a repeat run can be called a personal best. */
  pairs: Record<string, number>;
  /** The newest runs first, capped. */
  recent: RunRecord[];
}

export const RECENT_KEPT = 20;
const PAIRS_KEPT = 200;
const KEY = 'astris:stats:v1';

export const emptyStats = (): Stats => ({
  version: 1,
  runs: 0,
  points: 0,
  stars: 0,
  streak: 0,
  longest: 0,
  lastDay: null,
  bestPoints: 0,
  fewestClicks: null,
  fastest: null,
  threeStar: 0,
  pairs: {},
  recent: [],
});

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function browserStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What storage holds, or an empty record when it holds nothing usable. Bad fields fall back one by one. */
export function loadStats(store: Pick<Store, 'getItem'> | undefined = browserStore()): Stats {
  try {
    const raw: unknown = JSON.parse(store?.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return emptyStats();
    const r = raw as Record<string, unknown>;
    const base = emptyStats();
    const pairs: Record<string, number> = {};
    if (typeof r.pairs === 'object' && r.pairs !== null) for (const [k, v] of Object.entries(r.pairs)) if (typeof v === 'number' && Number.isFinite(v)) pairs[k] = v;
    const recent = Array.isArray(r.recent)
      ? (r.recent as RunRecord[]).filter((x) => typeof x === 'object' && x !== null && typeof x.start === 'string' && typeof x.target === 'string').slice(0, RECENT_KEPT)
      : [];
    return {
      ...base,
      runs: num(r.runs, 0),
      points: num(r.points, 0),
      stars: num(r.stars, 0),
      streak: num(r.streak, 0),
      longest: num(r.longest, 0),
      lastDay: numOrNull(r.lastDay),
      bestPoints: num(r.bestPoints, 0),
      fewestClicks: numOrNull(r.fewestClicks),
      fastest: numOrNull(r.fastest),
      threeStar: num(r.threeStar, 0),
      pairs,
      recent,
    };
  } catch {
    return emptyStats();
  }
}

/** The streak a reader holds on a day: it carries on from yesterday, and is gone after a missed day. */
export function streakOn(stats: Stats, day: number): number {
  return stats.lastDay !== null && day - stats.lastDay <= 1 ? stats.streak : 0;
}

export interface Recorded {
  stats: Stats;
  score: Score;
  /** Which personal bests this run set. A first finish sets none, so there is always something to beat. */
  records: { points: boolean; clicks: boolean; time: boolean };
  /** True when this pair had no earlier run. */
  isNew: boolean;
  streak: number;
  streakGrew: boolean;
}

/** Add a finished run to the stats. Pure: returns the new stats and what the run set, and leaves the input alone. */
export function addRun(old: Stats, run: Omit<RunRecord, 'points' | 'stars'>): Recorded {
  const score = scoreRun(run);
  const pairKey = run.start + '|' + run.target;
  const before = old.pairs[pairKey];
  const isNew = before === undefined;
  const records = {
    points: !isNew && score.points > before,
    clicks: old.fewestClicks !== null && run.clicks < old.fewestClicks,
    time: old.fastest !== null && run.time < old.fastest,
  };
  const carried = streakOn(old, run.day);
  const streak = old.lastDay === run.day ? Math.max(1, old.streak) : carried + 1;
  const pairs = { ...old.pairs, [pairKey]: Math.max(before ?? 0, score.points) };
  const keys = Object.keys(pairs);
  // Keep the pair table from growing for ever: drop the oldest entries first.
  for (const k of keys.slice(0, Math.max(0, keys.length - PAIRS_KEPT))) delete pairs[k];
  const record: RunRecord = { ...run, points: score.points, stars: score.stars };
  const stats: Stats = {
    version: 1,
    runs: old.runs + 1,
    points: old.points + score.points,
    stars: old.stars + (score.stars ?? 0),
    streak,
    longest: Math.max(old.longest, streak),
    lastDay: run.day,
    bestPoints: Math.max(old.bestPoints, score.points),
    fewestClicks: old.fewestClicks === null ? run.clicks : Math.min(old.fewestClicks, run.clicks),
    fastest: old.fastest === null ? run.time : Math.min(old.fastest, run.time),
    threeStar: old.threeStar + (score.stars === 3 ? 1 : 0),
    pairs,
    recent: [record, ...old.recent].slice(0, RECENT_KEPT),
  };
  return { stats, score, records, isNew, streak, streakGrew: old.lastDay !== run.day };
}

/** Record a finished run in this browser. The result still shows when storage is blocked. */
export function recordRun(run: Omit<RunRecord, 'points' | 'stars'>, store: Store | undefined = browserStore()): Recorded {
  const out = addRun(loadStats(store), run);
  try {
    store?.setItem(KEY, JSON.stringify(out.stats));
  } catch {
    // Full or blocked: the finish card still shows, the run is just not remembered.
  }
  return out;
}

/** Forget everything kept. */
export function clearStats(store: Pick<Store, 'setItem'> | undefined = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(emptyStats()));
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
