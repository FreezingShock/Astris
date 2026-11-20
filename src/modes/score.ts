/** What a finished run is worth. Pure: no clock, no storage, no DOM. */

export interface RunInput {
  clicks: number;
  /** Fewest clicks known, -1 when none was found, null while the search ran. */
  par: number | null;
  /** Milliseconds from the first click's start to the arrival. */
  time: number;
  /** How many hints the reader asked for. */
  hints: number;
}

export interface Score {
  points: number;
  /** 1 to 3, or null when par is unknown and the run cannot be rated. */
  stars: 1 | 2 | 3 | null;
  /** The steps part of the points, so a card can explain itself. */
  steps: number;
  speed: number;
  hintCost: number;
}

/** Points for matching par. Each click over par costs a share of it; each click under par adds a bonus. */
const STEP_MAX = 600;
const SHORTCUT_BONUS = 100;
/** Points for speed: full at once, none after this much time per step of par plus a flat allowance. */
const SPEED_MAX = 300;
const SECONDS_PER_STEP = 30;
const SECONDS_FLAT = 30;
/** What one hint costs. */
export const HINT_COST = 100;
/** Without a known par, steps count for this much and the run has no star rating. */
const STEP_UNRATED = 300;

/** Score a finished run. Par is a click count, so a run can beat it by finding a shortcut. */
export function scoreRun(run: RunInput): Score {
  const known = run.par !== null && run.par > 0;
  const par = run.par ?? 0;
  const steps = known ? Math.round(STEP_MAX * Math.min(1, par / Math.max(1, run.clicks))) + SHORTCUT_BONUS * Math.max(0, par - run.clicks) : STEP_UNRATED;
  const allowance = (known ? par : 4) * SECONDS_PER_STEP + SECONDS_FLAT;
  const speed = Math.round(SPEED_MAX * Math.max(0, 1 - run.time / 1000 / allowance));
  const hintCost = Math.max(0, run.hints) * HINT_COST;
  const points = Math.max(0, steps + speed - hintCost);
  let stars: Score['stars'] = null;
  if (known) {
    const over = run.clicks - par;
    stars = over <= 0 && run.hints === 0 ? 3 : over <= 1 && run.hints <= 1 ? 2 : 1;
  }
  return { points, stars, steps, speed, hintCost };
}

/** "★★☆" for a rating, empty for an unrated run. */
export function starsText(stars: Score['stars']): string {
  return stars === null ? '' : '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
