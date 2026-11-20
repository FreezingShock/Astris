import { describe, expect, it } from 'vitest';
import { beginRace, clockText, expire, hudHtml, stepRace } from '../../src/modes/race';
import { BACKTRACKS, BLITZ_SECONDS, NO_RULES, PLACE_SUBJECT, REVEALS, refusal, revealText, secondsLeft } from '../../src/modes/rules';

const seen = (...t: string[]): Set<string> => new Set(t);

describe('refusal', () => {
  it('blocks place articles only when the rule is on, and never the target', () => {
    const on = { ...NO_RULES, places: true };
    expect(refusal(on, 'France', 'Jazz', PLACE_SUBJECT, seen(), 0)).toMatch(/No places/);
    expect(refusal(on, 'Jazz', 'Jazz', PLACE_SUBJECT, seen(), 0)).toBeNull();
    expect(refusal(on, 'Blues', 'Jazz', 'Arts', seen(), 0)).toBeNull();
    expect(refusal(NO_RULES, 'France', 'Jazz', PLACE_SUBJECT, seen(), 0)).toBeNull();
  });
  it('allows a limited number of revisits', () => {
    const on = { ...NO_RULES, backtracks: true };
    expect(refusal(on, 'A', 'Z', undefined, seen('A'), BACKTRACKS - 1)).toBeNull();
    expect(refusal(on, 'A', 'Z', undefined, seen('A'), BACKTRACKS)).toMatch(/No backtracks/);
    expect(refusal(on, 'B', 'Z', undefined, seen('A'), BACKTRACKS)).toBeNull();
  });
});

describe('race with rules', () => {
  it('counts revisits as clicks pass through seen articles', () => {
    const race = beginRace('A', 'Z', 3, 0, undefined, false, { ...NO_RULES, backtracks: true });
    stepRace(race, 'B', 1);
    stepRace(race, 'A', 2);
    expect(race.revisits).toBe(1);
    expect(race.clicks).toBe(2);
  });
  it('counts down in Blitz and ends the race when the clock runs out', () => {
    const race = beginRace('A', 'Z', 3, 0, undefined, false, { ...NO_RULES, blitz: true });
    expect(secondsLeft(race.rules, 0)).toBe(BLITZ_SECONDS);
    expect(clockText(race, 30_000)).toBe('01:00');
    expect(expire(race, 30_000)).toBe(false);
    expect(expire(race, BLITZ_SECONDS * 1000)).toBe(true);
    expect(race.lost).toBe(true);
    expect(hudHtml(race)).toContain("Time's up");
    expect(hudHtml(race)).not.toContain('Arrived');
  });
  it('has no clock limit without Blitz', () => {
    const race = beginRace('A', 'Z', 3, 0);
    expect(expire(race, 1e9)).toBe(false);
    expect(race.reveals).toBe(REVEALS);
  });
  it('shows the rule buttons and a Reveal button, but not on the daily race', () => {
    expect(hudHtml(beginRace('A', 'Z', 3, 0))).toContain('data-rule="places"'.replace(/"/g, "'"));
    expect(hudHtml(beginRace('A', 'Z', 3, 0))).toContain("id='reveal'");
    expect(hudHtml(beginRace('A', 'Z', 3, 0, 5))).not.toContain('data-rule');
  });
});

describe('revealText', () => {
  it('names the distance and the first step', () => {
    expect(revealText(['A', 'B', 'Z'])).toBe('A route of 2 clicks exists from here. First step: B.');
    expect(revealText(['A', 'Z'])).toContain('1 click ');
    expect(revealText(null)).toMatch(/No short route/);
  });
});
