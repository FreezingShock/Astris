import { describe, expect, it } from 'vitest';
import { MAX_STARS, SampleProvider, rankOf } from '../../src/data';

describe('rankOf', () => {
  it('follows the five-rank rule', () => {
    expect(rankOf(true, true, true)).toBe(1);
    expect(rankOf(true, true, false)).toBe(2);
    expect(rankOf(true, false, true)).toBe(3);
    expect(rankOf(false, true, true)).toBe(3);
    expect(rankOf(true, false, false)).toBe(4);
    expect(rankOf(false, true, false)).toBe(4);
    expect(rankOf(false, false, true)).toBe(5);
  });
});

describe('SampleProvider', () => {
  const provider = new SampleProvider();

  it('returns a full, ranked constellation', async () => {
    const con = await provider.constellation('Architecture');
    expect(con.center).toEqual({ title: 'Architecture', subject: 'Architecture' });
    expect(con.stars).toHaveLength(MAX_STARS);
    expect(new Set(con.stars.map((s) => s.title)).size).toBe(MAX_STARS);
    expect(con.stars.some((s) => s.title === 'Architecture')).toBe(false);
    for (let i = 1; i < con.stars.length; i++) {
      const a = con.stars[i - 1]!;
      const b = con.stars[i]!;
      expect(a.rank < b.rank || (a.rank === b.rank && a.score >= b.score)).toBe(true);
    }
    for (const s of con.stars) expect(s.rank).toBe(rankOf(s.linksOut, s.linksIn, s.nameMatch));
  });

  it('is deterministic', async () => {
    expect(await provider.constellation('Jazz')).toEqual(await new SampleProvider().constellation('Jazz'));
  });

  it('can travel to a generated title it handed out', async () => {
    const con = await provider.constellation('Architecture');
    const generated = con.stars.find((s) => !SampleProvider.isReal(s.title))!;
    const next = await provider.constellation(generated.title);
    expect(next.center.subject).toBe(generated.subject);
    expect(next.stars.length).toBeGreaterThan(0);
  });

  it('rejects an unknown article', async () => {
    await expect(provider.constellation('Not an article')).rejects.toThrow();
  });

  it('suggests by prefix first, at most seven', async () => {
    const found = await provider.suggest('br');
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(7);
    expect(found[0]!.title.toLowerCase().startsWith('br')).toBe(true);
    expect(await provider.suggest('   ')).toEqual([]);
    expect(await provider.suggest('zzzz')).toEqual([]);
  });

  it('has symmetric subject neighbours', async () => {
    expect(await provider.neighbours('History')).toContain('Music');
    expect(await provider.neighbours('Music')).toContain('History');
  });
});
