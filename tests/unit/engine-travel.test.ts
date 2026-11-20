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

  it('3. blooms new stars behind the ring, each thread drawn just before its star lands', async () => {
    const { dom, engine, go } = await setup();
    await go('Jazz');
    const con = engine.current!;
    expect(con.born).toBe(dom.now());
    const sweep = CONFIG.bloomRingMs;
    for (const n of con.nodes) {
      // a star pushed beyond the ring's reach appears after the ring has gone
      if (n.r > CONFIG.rMax) continue;
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

  it('4. eases the camera to the new centre', async () => {
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

  it('5. reports the new constellation, whose subject the background tint follows', async () => {
    const { changes, go } = await setup();
    await go('Jazz');
    expect(changes.at(-1)?.title).toBe('Jazz');
    expect(changes.at(-1)?.subject).toBe('Music');
  });
});

describe('a map that grows', () => {
  it('keeps everything that was there, at full brightness and in place', async () => {
    const { dom, engine, go } = await setup();
    const old = await go('Jazz');
    dom.run(SETTLE_MS);
    const was = old.nodes.map((n) => [n.dx, n.dy, n.a]);
    await go('Black hole');
    dom.run(SETTLE_MS);
    expect(engine.memories.map((c) => c.title)).toEqual(['Architecture', 'Jazz']);
    expect(old.dim).toBe(1);
    expect(old.ghost).toBeNull();
    expect(old.nodes.map((n) => [n.dx, n.dy, n.a])).toEqual(was);
    expect(old.nodes.every((n) => n.a === 1)).toBe(true);
  });

  it('adds the new neighbours around the chosen star, and never an article twice', async () => {
    const { dom, engine, go } = await setup();
    const first = engine.current!;
    const before = engine.starCount;
    await go('Jazz');
    dom.run(SETTLE_MS);
    expect(engine.starCount).toBeGreaterThan(before);
    const real = engine.memories.concat(engine.current!).flatMap((c) => c.nodes.filter((n) => !n.dup).map((n) => n.title));
    expect(new Set(real).size).toBe(real.length);
    expect(real).not.toContain(first.title);
    const jazz = engine.current!;
    expect(jazz.sc).toBe(CONFIG.childScale);
    // a neighbour that was already on the map is marked, sits where it is and adds only a thread
    const dup = jazz.nodes.find((n) => n.dup);
    if (dup) {
      const home = first.nodes.find((n) => n.title === dup.title);
      if (home) {
        expect(jazz.x + dup.dx * jazz.sc).toBeCloseTo(first.x + home.dx * first.sc, 6);
        expect(jazz.y + dup.dy * jazz.sc).toBeCloseTo(first.y + home.dy * first.sc, 6);
      }
    }
  });

  it('keeps stars apart', async () => {
    const { dom, engine, go } = await setup();
    for (const title of ['Jazz', 'Black hole', 'Stoicism']) {
      await go(title);
      dom.run(SETTLE_MS);
    }
    const pts = engine.memories.concat(engine.current!).flatMap((c) => c.nodes.filter((n) => !n.dup).map((n) => ({ x: c.x + n.dx * c.sc, y: c.y + n.dy * c.sc })));
    let close = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) < CONFIG.starGap * 0.5) close++;
    expect(close).toBe(0);
  });

  it('clears older stars and threads out of the area a new constellation takes', async () => {
    const { dom, engine, go } = await setup();
    for (const title of ['Jazz', 'Black hole', 'Stoicism', 'Bridge']) {
      await go(title);
      dom.run(SETTLE_MS);
      const now = engine.current!;
      const R = CONFIG.rMax * now.sc * CONFIG.clearShare;
      const visited = new Set(engine.memories.map((c) => c.title).concat(now.title));
      for (const c of engine.memories) {
        for (const n of c.nodes) {
          if (n.dup || visited.has(n.title)) continue;
          expect(Math.hypot(c.x + n.dx * c.sc - now.x, c.y + n.dy * c.sc - now.y)).toBeGreaterThanOrEqual(R);
        }
      }
      // no thread hangs from a star that was removed
      for (const c of engine.memories.concat(now)) for (const n of c.nodes) if (n.par) expect(c.nodes).toContain(n.par);
    }
  });

  it('never clears the race target', async () => {
    const { dom, engine, go } = await setup();
    const target = engine.current!.nodes.find((n) => n.rank === 1)!;
    engine.markerTitle = target.title;
    await go('Jazz');
    dom.run(SETTLE_MS);
    const all = engine.memories.concat(engine.current!).flatMap((c) => c.nodes.map((n) => n.title));
    expect(all).toContain(target.title);
  });

  it('travels back to a centre already on the map without adding to it', async () => {
    const { dom, engine, go } = await setup();
    await go('Jazz');
    dom.run(SETTLE_MS);
    const count = engine.starCount;
    const jazz = engine.current!;
    await go('Architecture');
    expect(engine.current!.title).toBe('Architecture');
    expect(engine.starCount).toBe(count);
    expect(engine.memories).toEqual([jazz]);
    expect(engine.trail.at(-1)).toBe('Architecture');
    expect(engine.visited.has('Jazz')).toBe(true);
  });

  it('stays inside the star budget by dropping the oldest outer stars', async () => {
    const { dom, engine, go } = await setup();
    const keep = engine.current!;
    const was = keep.nodes.length;
    for (const title of ['Jazz', 'Black hole', 'Stoicism', 'Bridge', 'Opera', 'Chess']) {
      await go(title).catch(() => undefined);
      dom.run(SETTLE_MS);
    }
    expect(engine.starCount).toBeLessThanOrEqual(CONFIG.maxWorldStars + 400);
    expect(keep.nodes.length).toBeLessThanOrEqual(was);
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
    expect(old.sc).toBe(1);
    expect(old.nodes.every((n) => n.a === 1)).toBe(true);
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
