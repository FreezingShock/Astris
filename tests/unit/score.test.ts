import { describe, expect, it } from 'vitest';
import { scoreRun, starsText } from '../../src/modes/score';
import { addRun, dailyBest, emptyStats, loadStats, recordRun, saveDailyBest, streakOn } from '../../src/modes/stats';

const mem = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const run = (over: Partial<Parameters<typeof addRun>[1]> = {}): Parameters<typeof addRun>[1] => ({
  day: 100,
  mode: 'race',
  start: 'A',
  target: 'B',
  clicks: 4,
  par: 4,
  time: 30_000,
  hints: 0,
  ...over,
});

describe('scoreRun', () => {
  it('rewards par and three stars with no hints', () => {
    const s = scoreRun({ clicks: 4, par: 4, time: 0, hints: 0 });
    expect(s.points).toBe(900);
    expect(s.stars).toBe(3);
  });
  it('costs points for every click over par', () => {
    const at = scoreRun({ clicks: 4, par: 4, time: 60_000, hints: 0 });
    const over = scoreRun({ clicks: 6, par: 4, time: 60_000, hints: 0 });
    expect(over.points).toBeLessThan(at.points);
    expect(over.stars).toBe(1);
    expect(scoreRun({ clicks: 5, par: 4, time: 60_000, hints: 0 }).stars).toBe(2);
  });
  it('adds a bonus for a shortcut under par', () => {
    expect(scoreRun({ clicks: 3, par: 4, time: 0, hints: 0 }).steps).toBe(700);
  });
  it('charges for hints and drops the third star', () => {
    const s = scoreRun({ clicks: 4, par: 4, time: 0, hints: 1 });
    expect(s.points).toBe(800);
    expect(s.stars).toBe(2);
    expect(scoreRun({ clicks: 4, par: 4, time: 0, hints: 2 }).stars).toBe(1);
  });
  it('gives no speed points past the allowance and never goes below zero', () => {
    expect(scoreRun({ clicks: 4, par: 4, time: 10 * 60_000, hints: 0 }).speed).toBe(0);
    expect(scoreRun({ clicks: 50, par: 4, time: 10 * 60_000, hints: 20 }).points).toBe(0);
  });
  it('leaves a run unrated when par is unknown', () => {
    expect(scoreRun({ clicks: 4, par: -1, time: 0, hints: 0 }).stars).toBeNull();
    expect(scoreRun({ clicks: 4, par: null, time: 0, hints: 0 }).stars).toBeNull();
    expect(starsText(null)).toBe('');
    expect(starsText(2)).toBe('★★☆');
  });
});

describe('stats', () => {
  it('counts a first run and sets no records', () => {
    const r = addRun(emptyStats(), run());
    expect(r.stats.runs).toBe(1);
    expect(r.isNew).toBe(true);
    expect(r.records).toEqual({ points: false, clicks: false, time: false });
    expect(r.streak).toBe(1);
  });
  it('flags personal bests on a repeat run', () => {
    const first = addRun(emptyStats(), run({ clicks: 6, time: 90_000 }));
    const second = addRun(first.stats, run({ clicks: 4, time: 30_000 }));
    expect(second.records).toEqual({ points: true, clicks: true, time: true });
    const third = addRun(second.stats, run({ clicks: 5, time: 40_000 }));
    expect(third.records).toEqual({ points: false, clicks: false, time: false });
    expect(third.stats.pairs['A|B']).toBe(second.score.points);
  });
  it('grows the streak by day, holds it within a day and resets after a gap', () => {
    let s = addRun(emptyStats(), run({ day: 10 })).stats;
    s = addRun(s, run({ day: 10 })).stats;
    expect(s.streak).toBe(1);
    s = addRun(s, run({ day: 11 })).stats;
    expect(s.streak).toBe(2);
    expect(streakOn(s, 12)).toBe(2);
    expect(streakOn(s, 13)).toBe(0);
    s = addRun(s, run({ day: 14 })).stats;
    expect(s.streak).toBe(1);
    expect(s.longest).toBe(2);
  });
  it('keeps only the newest runs', () => {
    let s = emptyStats();
    for (let i = 0; i < 30; i++) s = addRun(s, run({ day: i, target: 'T' + i })).stats;
    expect(s.recent).toHaveLength(20);
    expect(s.recent[0]?.target).toBe('T29');
    expect(s.runs).toBe(30);
  });
  it('saves and loads through storage, and survives junk or a blocked store', () => {
    const store = mem();
    recordRun(run(), store);
    expect(loadStats(store).runs).toBe(1);
    store.setItem('astris:stats:v1', '{"runs":"x","recent":[1,{"start":"a","target":"b"}],"pairs":{"a":"b","c":2}}');
    const bad = loadStats(store);
    expect(bad.runs).toBe(0);
    expect(bad.recent).toHaveLength(1);
    expect(bad.pairs).toEqual({ c: 2 });
    store.setItem('astris:stats:v1', 'not json');
    expect(loadStats(store).runs).toBe(0);
    expect(recordRun(run(), undefined).stats.runs).toBe(1);
  });
});

describe('daily history in the stats record', () => {
  it('copies the old astris:daily keys in once, keeps them, and reads and writes through stats', () => {
    const D = Math.floor(Date.now() / 86_400_000) - 3;
    const store = mem();
    store.setItem(`astris:daily:${D}`, JSON.stringify({ clicks: 4, time: 9000, par: 3 }));
    store.setItem(`astris:daily:hard:${D + 1}`, JSON.stringify({ clicks: 6, time: 1 }));
    store.setItem(`astris:daily:${D + 2}`, '{broken');
    expect(dailyBest(D, false, store)).toEqual({ clicks: 4, time: 9000, par: 3 });
    expect(dailyBest(D + 1, true, store)).toEqual({ clicks: 6, time: 1 });
    expect(dailyBest(D + 1, false, store)).toBeNull();
    expect(dailyBest(D + 2, false, store)).toBeNull();
    expect(loadStats(store).migrated).toBe(true);
    expect(store.data.get(`astris:daily:${D}`)).toBeDefined();
    // Later changes to the old key are ignored: stats is the one source of truth.
    store.setItem(`astris:daily:${D}`, JSON.stringify({ clicks: 1, time: 1 }));
    expect(dailyBest(D, false, store)?.clicks).toBe(4);
    expect(saveDailyBest(D, { clicks: 3, time: 5 }, false, store)).toEqual({ clicks: 3, time: 5 });
    expect(saveDailyBest(D, { clicks: 5, time: 1 }, false, store)).toEqual({ clicks: 3, time: 5 });
  });
  it('keeps daily history when a run is recorded', () => {
    const store = mem();
    saveDailyBest(7, { clicks: 2, time: 1 }, false, store);
    recordRun(run(), store);
    expect(dailyBest(7, false, store)).toEqual({ clicks: 2, time: 1 });
  });
});
