import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleProvider } from '../../src/data';
import { CONFIG } from '../../src/engine/config';
import { Engine } from '../../src/engine/engine';
import type { Con, StarNode } from '../../src/engine/model';
import type { Constellation } from '../../src/types';
import { fakeDom, type FakeDom } from './helpers/fake-dom';

afterEach(() => vi.unstubAllGlobals());

const provider = new SampleProvider();
const SETTLE_MS = 6000;

interface Setup {
  dom: FakeDom;
  engine: Engine;
  changes: Con[];
  /** Travel to a title and return the constellation that was live before. */
  go(title: string): Promise<Con>;
}

async function setup(reducedMotion = false): Promise<Setup> {
  const dom = fakeDom(1200, 800, reducedMotion);
  const changes: Con[] = [];
  const engine = new Engine(dom.canvas, { onChange: (con) => changes.push(con) });
  engine.enable();
  engine.reset(await provider.constellation('Architecture'));
  dom.run(SETTLE_MS);
  const go = async (title: string): Promise<Con> => {
    const from = engine.current!;
    engine.travel(await provider.constellation(title));
    return from;
  };
  return { dom, engine, changes, go };
}

/** A star of the live constellation that the sample set can travel to. */
async function reachable(con: Con, rank: (r: number) => boolean): Promise<{ star: StarNode; data: Constellation }> {
  for (const star of con.nodes) {
    if (!rank(star.rank)) continue;
    const data = await provider.constellation(star.title).catch(() => null);
    if (data) return { star, data };
  }
  throw new Error('no reachable star');
}

describe('travel, step by step', () => {
  it('1. leaves the clicked star where it stands as the new centre', async () => {
    const { engine } = await setup();
    const from = engine.current!;
    const { star, data } = await reachable(from, () => true);
    engine.travel(data);
    expect(engine.current!.title).toBe(star.title);
    expect(engine.current!.x).toBeCloseTo(from.x + star.dx, 9);
    expect(engine.current!.y).toBeCloseTo(from.y + star.dy, 9);
  });

  it('2. sweeps one ring of light outward from the new centre', async () => {
    const { dom, engine, go } = await setup();
    await go('Jazz');
    const radii: number[] = [];
    for (let t = 0; t < CONFIG.bloomRingMs - 50; t += 50) {
      dom.calls.delete('arc');
      dom.step(50);
      const con = engine.current!;
      const ring = (dom.calls.get('arc') ?? []).filter((a) => a[0] === con.cx && a[1] === con.cy).map((a) => Number(a[2]));
      radii.push(Math.max(...ring));
    }
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]!);
    dom.run(200);
    dom.calls.delete('arc');
    dom.step();
    expect(dom.calls.get('arc') ?? []).toHaveLength(0);
  });

  it('3. dissolves the old stars away from the new centre, nearest first', async () => {
    const { engine } = await setup();
    const from = engine.current!;
    const { star, data } = await reachable(from, () => true);
    engine.travel(data);
    const centre = engine.current!;
    const byDistance = from.nodes
      .filter((n) => n !== star)
      .map((n) => ({ n, d: Math.hypot(from.x + n.dx - centre.x, from.y + n.dy - centre.y) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 1; i < byDistance.length; i++) expect(byDistance[i]!.n.gd).toBeGreaterThanOrEqual(byDistance[i - 1]!.n.gd);
    for (const { n, d } of byDistance) {
      expect(n.gux).toBeCloseTo((from.x + n.dx - centre.x) / d, 9);
      expect(n.guy).toBeCloseTo((from.y + n.dy - centre.y) / d, 9);
    }
  });

  it('4. blooms new stars behind the ring, each thread drawn just before its star lands', async () => {
    const { dom, engine, go } = await setup();
    await go('Jazz');
    const con = engine.current!;
    expect(con.born).toBe(dom.now());
    const sweep = CONFIG.bloomRingMs;
    for (const n of con.nodes) {
      // the ring eases out, so it has passed a star's distance well before the star is born
      const ringReaches = con.born + sweep * (1 - Math.cbrt(1 - n.r / CONFIG.rMax));
      expect(n.born).toBeGreaterThan(ringReaches);
      expect(n.born - CONFIG.threadDrawMs).toBeLessThan(n.born);
    }
    dom.step();
    expect(con.nodes.every((n) => n.a === 0)).toBe(true);
    dom.run(SETTLE_MS);
    expect(con.nodes.every((n) => n.a === 1)).toBe(true);
  });

  it('5. eases the camera to the new centre', async () => {
    const { dom, engine } = await setup();
    const restX = engine.current!.cx;
    const restY = engine.current!.cy;
    engine.travel((await reachable(engine.current!, () => true)).data);
    dom.step();
    const startOff = Math.hypot(engine.current!.cx - restX, engine.current!.cy - restY);
    expect(startOff).toBeGreaterThan(1);
    dom.run(400);
    const midOff = Math.hypot(engine.current!.cx - restX, engine.current!.cy - restY);
    expect(midOff).toBeLessThan(startOff);
    expect(midOff).toBeGreaterThan(0.5);
    dom.run(SETTLE_MS);
    expect(engine.current!.cx).toBeCloseTo(restX, 0);
    expect(engine.current!.cy).toBeCloseTo(restY, 0);
  });

  it('6. reports the new constellation, whose subject the background tint follows', async () => {
    const { changes, go } = await setup();
    await go('Jazz');
    expect(changes.at(-1)?.title).toBe('Jazz');
    expect(changes.at(-1)?.subject).toBe('Music');
  });
});

describe('memories', () => {
  it('keeps the centre and ranks 1 and 2 at 30% brightness, shrunk to 46% and 610 units away', async () => {
    const { dom, engine, go } = await setup();
    const old = await go('Jazz');
    dom.run(SETTLE_MS);
    const now = engine.current!;
    expect(engine.memories).toEqual([old]);
    expect(old.dim).toBeCloseTo(CONFIG.memoryDim, 2);
    expect(old.sc).toBeCloseTo(CONFIG.memoryScale, 6);
    expect(Math.hypot(old.x - now.x, old.y - now.y)).toBeCloseTo(CONFIG.memoryDistance, 6);
    for (const n of old.nodes) expect(n.a > 0).toBe(n.rank <= CONFIG.memoryKeepRank);
  });

  it('does not keep the star the reader left through, whatever its rank', async () => {
    const { dom, engine } = await setup();
    const from = engine.current!;
    const { star, data } = await reachable(from, (r) => r <= CONFIG.memoryKeepRank);
    engine.travel(data);
    dom.run(SETTLE_MS);
    expect(from.ghost?.via).toBe(star);
    expect(star.a).toBe(0);
    expect(from.nodes.some((n) => n.a > 0)).toBe(true);
  });

  it('holds at most three, oldest dropped first, and travels back to one', async () => {
    const { dom, engine, go } = await setup();
    for (const title of ['Jazz', 'Black hole', 'Stoicism', 'Bridge']) {
      await go(title);
      dom.run(SETTLE_MS);
    }
    expect(engine.memories.map((c) => c.title)).toEqual(['Jazz', 'Black hole', 'Stoicism']);
    const jazz = engine.memories[0]!;
    const at = { x: jazz.x, y: jazz.y };
    await go('Jazz');
    expect({ x: engine.current!.x, y: engine.current!.y }).toEqual(at);
    dom.run(SETTLE_MS);
    expect(engine.memories.map((c) => c.title)).toEqual(['Black hole', 'Stoicism', 'Bridge']);
    expect(engine.trail.at(-1)).toBe('Jazz');
    expect(engine.visited.has('Bridge')).toBe(true);
  });
});

describe('reduced motion', () => {
  it('draws the finished picture at once and then rests', async () => {
    const dom = fakeDom(1200, 800, true);
    const engine = new Engine(dom.canvas);
    engine.enable();
    engine.reset(await provider.constellation('Architecture'));
    dom.step();
    expect(engine.current!.nodes.every((n) => n.a === 1)).toBe(true);
    dom.step();
    expect(engine.running).toBe(false);
    const old = engine.current!;
    engine.travel(await provider.constellation('Jazz'));
    dom.step();
    expect(old.sc).toBeCloseTo(CONFIG.memoryScale, 9);
    expect(old.nodes.every((n) => n.a === (n.rank <= CONFIG.memoryKeepRank ? 1 : 0))).toBe(true);
    expect(engine.current!.nodes.every((n) => n.a === 1)).toBe(true);
  });

  it('wakes for one frame when the ring under the pointer changes', async () => {
    const dom = fakeDom(1200, 800, true);
    const engine = new Engine(dom.canvas);
    engine.enable();
    engine.reset(await provider.constellation('Architecture'));
    dom.run(100);
    expect(engine.running).toBe(false);
    const star = engine.current!.nodes.find((n) => n.on)!;
    dom.fire('pointermove', { clientX: star.sx, clientY: star.sy });
    expect(engine.running).toBe(true);
  });
});
