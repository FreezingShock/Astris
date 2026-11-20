import { describe, expect, it } from 'vitest';
import { makeCon } from '../../src/engine/layout';
import { frameTimes, syntheticConstellation } from '../../src/engine/trace';

describe('syntheticConstellation', () => {
  it('makes the asked number of stars, sorted by rank, the same every time', () => {
    const a = syntheticConstellation('Trace 0', 120);
    expect(a.stars).toHaveLength(120);
    expect(a).toEqual(syntheticConstellation('Trace 0', 120));
    for (let i = 1; i < a.stars.length; i++) expect(a.stars[i]!.rank).toBeGreaterThanOrEqual(a.stars[i - 1]!.rank);
    expect(new Set(a.stars.map((s) => s.rank))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(new Set(a.stars.map((s) => s.title)).size).toBe(120);
  });

  it('lays out like a real constellation', () => {
    const con = makeCon(syntheticConstellation('Trace 1', 120), 0, 0, 0, 0);
    expect(con.nodes).toHaveLength(120);
    expect(con.topics[0]).toBe(con.subject);
  });
});

describe('frameTimes', () => {
  it('reports a steady 60 frames per second as on budget', () => {
    const stamps = Array.from({ length: 61 }, (_, i) => (i * 1000) / 60);
    const t = frameTimes(stamps);
    expect(t.frames).toBe(60);
    expect(t.fps).toBeCloseTo(60, 6);
    expect(t.slowShare).toBe(0);
  });

  it('counts frames that ran long, and finds the worst', () => {
    const t = frameTimes([0, 16, 32, 82, 98]);
    expect(t.frames).toBe(4);
    expect(t.worstMs).toBe(50);
    expect(t.slowShare).toBe(0.25);
    expect(t.meanMs).toBe(24.5);
  });

  it('is empty for fewer than two frames', () => {
    expect(frameTimes([5]).frames).toBe(0);
    expect(frameTimes([]).fps).toBe(0);
  });
});
