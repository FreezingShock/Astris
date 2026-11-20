import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import { CONFIG } from '../../src/engine/config';
import { zoomSize } from '../../src/engine/draw';
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

describe('CONFIG', () => {
  it('holds the numbers the build spec names', () => {
    expect(CONFIG.band[1]?.[0]).toBe(72);
    expect(CONFIG.band[5]?.[1]).toBe(368);
    expect(CONFIG.rMax).toBe(368);
    expect(CONFIG.centreThreadRadius).toBe(128);
    expect(CONFIG.pulses).toBe(12);
    expect(CONFIG.maxLabels).toBe(46);
    expect(CONFIG.maxPixelRatio).toBe(2);
    expect(CONFIG.bloomRingMs).toBe(1150);
    expect(CONFIG.memoryDim).toBe(0.3);
    expect(CONFIG.memoryScale).toBe(0.46);
    expect(CONFIG.memoryDistance).toBe(610);
    expect(CONFIG.maxMemories).toBe(3);
    expect(CONFIG.memoryKeepRank).toBe(2);
  });

  it('gives every rank a size, a brightness and a band, each fainter and farther than the last', () => {
    for (let rank = 2; rank <= 5; rank++) {
      expect(CONFIG.size[rank]).toBeLessThan(CONFIG.size[rank - 1]!);
      expect(CONFIG.starAlpha[rank]).toBeLessThan(CONFIG.starAlpha[rank - 1]!);
      expect(CONFIG.threadAlpha[rank]).toBeLessThan(CONFIG.threadAlpha[rank - 1]!);
      expect(CONFIG.band[rank]![0]).toBe(CONFIG.band[rank - 1]![1]);
    }
  });
});

describe('zoomSize', () => {
  it('follows the square root of the zoom between its limits', () => {
    expect(zoomSize(1)).toBe(1);
    expect(zoomSize(1.44)).toBeCloseTo(1.2, 9);
    expect(zoomSize(0.01)).toBe(CONFIG.zoomSizeMin);
    expect(zoomSize(100)).toBe(CONFIG.zoomSizeMax);
  });
});
