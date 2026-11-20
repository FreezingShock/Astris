export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** What a new race asks for until the reader picks one. Medium matches the pairs Astris picked before levels existed. */
export const DEFAULT_LEVEL: Level = 'medium';

/** An article with at least this many neighbours is a hub (Paris, Jazz): easy to run into from anywhere. */
export const HUB_LINKS = 60;
/** An article with fewer neighbours than this is thin: few ways in, so hard to reach. */
export const THIN_LINKS = 12;

/** 0 for a hub, 1 for an ordinary article, 2 for a thin one. Neighbours are the stars the map would draw, so about 120 at most. */
export function obscurity(links: number): 0 | 1 | 2 {
  return links >= HUB_LINKS ? 0 : links < THIN_LINKS ? 2 : 1;
}

/** Difficulty points: one for every click beyond two, plus how obscure the target is. */
export function points(par: number, targetLinks: number): number {
  return Math.max(0, par - 2) + obscurity(targetLinks);
}

/** The level a pair rates: up to one point is easy, two is medium, three or more is hard. */
export function rate(par: number, targetLinks: number): Level {
  const p = points(par, targetLinks);
  return p <= 1 ? 'easy' : p === 2 ? 'medium' : 'hard';
}

/** How many clicks a walk takes when it looks for a pair of this level. */
export function walkSteps(level: Level, rand: () => number): number {
  const coin = rand() < 0.5;
  return level === 'easy' ? (coin ? 2 : 3) : level === 'medium' ? (coin ? 3 : 4) : coin ? 4 : 5;
}

/** How far a pair's points sit from the level wanted: zero when it matches. */
export function miss(level: Level, par: number, targetLinks: number): number {
  const p = points(par, targetLinks);
  if (level === 'easy') return Math.max(0, p - 1);
  if (level === 'hard') return Math.max(0, 3 - p);
  return Math.abs(p - 2);
}

const KEY = 'astris:level';

/** The reader's last choice, kept in this browser only. */
export function savedLevel(store: Pick<Storage, 'getItem'> | undefined = browser()): Level {
  try {
    const v = store?.getItem(KEY);
    return LEVELS.find((l) => l === v) ?? DEFAULT_LEVEL;
  } catch {
    return DEFAULT_LEVEL;
  }
}

export function saveLevel(level: Level, store: Pick<Storage, 'setItem'> | undefined = browser()): void {
  try {
    store?.setItem(KEY, level);
  } catch {
    // Blocked storage: the choice just lasts until the page closes.
  }
}

function browser(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The segmented control that picks a level. */
export function levelPickerHtml(current: Level): string {
  return (
    "<span class='levels' role='group' aria-label='Difficulty'>" +
    LEVELS.map((l) => "<button class='lv' type='button' data-level='" + l + "' aria-pressed='" + (l === current) + "'>" + LEVEL_LABEL[l] + '</button>').join('') +
    '</span>'
  );
}
