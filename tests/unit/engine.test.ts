import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import { CONFIG } from '../../src/engine/config';
import { makeCon } from '../../src/engine/layout';

describe('makeCon', () => {
  it('places every star in the band of its rank', async () => {
    const data = await new SampleProvider().constellation('Architecture');
    const con = makeCon(data, 0, 0, 0, 0);
    expect(con.nodes).toHaveLength(data.stars.length);
    for (const n of con.nodes) {
      const [inner, outer] = CONFIG.band[n.rank]!;
      expect(n.r).toBeGreaterThanOrEqual(inner);
      expect(n.r).toBeLessThanOrEqual(outer);
      expect(Math.hypot(n.dx, n.dy)).toBeCloseTo(n.r, 6);
    }
  });

  it('hangs each star from one closer to the centre, or from the centre', async () => {
    const data = await new SampleProvider().constellation('Jazz');
    const con = makeCon(data, 0, 0, 0, 0);
    for (const n of con.nodes) {
      if (n.par) expect(n.par.r).toBeLessThanOrEqual(n.r);
      if (n.r < CONFIG.centreThreadRadius) expect(n.par).toBeNull();
    }
  });

  it('puts the centre subject first and counts every star once', async () => {
    const data = await new SampleProvider().constellation('Jazz');
    const con = makeCon(data, 10, 20, 0, 0);
    expect(con.topics[0]).toBe('Music');
    expect(Object.values(con.counts).reduce((a, b) => a + b, 0)).toBe(data.stars.length);
    expect([con.x, con.y]).toEqual([10, 20]);
  });
});
