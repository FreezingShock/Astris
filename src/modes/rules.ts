/** Optional rules a race can be played under. They make a race harder, never easier. */
export interface Rules {
  /** Articles about places are off limits, unless one is the target. */
  places: boolean;
  /** Visiting an article you have already been to uses one backtrack. */
  backtracks: boolean;
  /** The race has a countdown instead of a free clock. */
  blitz: boolean;
}

export const NO_RULES: Rules = { places: false, backtracks: false, blitz: false };
/** The subject the "no places" rule blocks. */
export const PLACE_SUBJECT = 'Geography';
/** Revisits allowed when the backtrack rule is on. */
export const BACKTRACKS = 2;
/** Seconds on the clock in Blitz. */
export const BLITZ_SECONDS = 90;
/** Reveals a reader may use in one race. */
export const REVEALS = 2;

/** The most articles one Reveal may ask the provider for. */
export const REVEAL_BUDGET = 6;

const KEY = 'astris:rules';

/** The rules the reader last chose, or none. Storage may be blocked, which also means none. */
export function loadRules(): Rules {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      return { places: r.places === true, backtracks: r.backtracks === true, blitz: r.blitz === true };
    }
  } catch {
    /* no saved rules */
  }
  return { ...NO_RULES };
}

export function saveRules(rules: Rules): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* the rules still apply to this race */
  }
}

/** What a rule button says. */
export function ruleLabel(rule: keyof Rules): string {
  return rule === 'places' ? 'No places' : rule === 'backtracks' ? BACKTRACKS + ' backtracks' : 'Blitz ' + BLITZ_SECONDS + 's';
}

/** The seconds left in a Blitz race, never below zero. Null when the race is not Blitz. */
export function secondsLeft(rules: Rules, elapsedMs: number): number | null {
  return rules.blitz ? Math.max(0, Math.ceil(BLITZ_SECONDS - elapsedMs / 1000)) : null;
}

/** Why a click is refused under the rules, or null when it is allowed. */
export function refusal(rules: Rules, title: string, target: string, subject: string | undefined, seen: ReadonlySet<string>, revisits: number): string | null {
  if (title === target) return null;
  if (rules.places && subject === PLACE_SUBJECT) return 'No places in this race. Pick a different star.';
  if (rules.backtracks && seen.has(title) && revisits >= BACKTRACKS) return 'No backtracks left. Pick an article you have not been to.';
  return null;
}

/** The line a Reveal shows, from the chain found between here and the target (null when none was found). */
export function revealText(chain: readonly string[] | null): string {
  if (!chain || chain.length < 2) return 'No short route found from here. Try a different branch.';
  const clicks = chain.length - 1;
  const next = chain[1] ?? '';
  return 'A route of ' + clicks + (clicks === 1 ? ' click' : ' clicks') + ' exists from here. First step: ' + next + '.';
}
