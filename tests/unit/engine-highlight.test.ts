import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleProvider } from '../../src/data';
import { CONFIG } from '../../src/engine/config';
import { Engine, nudgeIntoView } from '../../src/engine/engine';
import type { PickTarget } from '../../src/engine/model';
import { fakeDom } from './helpers/fake-dom';

afterEach(() => vi.unstubAllGlobals());

async function grown(): Promise<{ engine: Engine; hovers: (PickTarget | null)[] }> {
  const dom = fakeDom();
  const hovers: (PickTarget | null)[] = [];
  const engine = new Engine(dom.canvas, { onHover: (target) => hovers.push(target) });
  engine.enable();
  engine.reset(await new SampleProvider().constellation('Architecture'));
  dom.run(4000);
  return { engine, hovers };
}

describe('nudgeIntoView', () => {
  it('leaves a point that is well inside the view alone', () => {
    expect(nudgeIntoView({ x: 300, y: 200 }, 800, 600, 40)).toEqual({ x: 0, y: 0 });
  });

  it('moves the view just far enough to bring a point inside the margin', () => {
    expect(nudgeIntoView({ x: 10, y: 590 }, 800, 600, 40)).toEqual({ x: -30, y: 30 });
    expect(nudgeIntoView({ x: 830, y: -5 }, 800, 600, 40)).toEqual({ x: 70, y: -45 });
  });
});

describe('Engine.highlight', () => {
  it('rings a grown star and reports it as a hover', async () => {
    const { engine, hovers } = await grown();
    const star = engine.current?.nodes.find((n) => n.on);
    expect(star).toBeDefined();
    expect(engine.highlight(star!.title)).toBe(true);
    const last = hovers.at(-1);
    expect(last).toEqual({ kind: 'star', node: star });
  });

  it('clears the ring for null and for a title that is not on the map', async () => {
    const { engine, hovers } = await grown();
    const star = engine.current!.nodes.find((n) => n.on)!;
    engine.highlight(star.title);
    expect(engine.highlight(null)).toBe(false);
    expect(hovers.at(-1)).toBeNull();
    expect(engine.highlight('No such article')).toBe(false);
    expect(hovers.at(-1)).toBeNull();
  });

  it('refuses a star that has not grown yet', async () => {
    const dom = fakeDom();
    const engine = new Engine(dom.canvas);
    engine.enable();
    engine.reset(await new SampleProvider().constellation('Architecture'));
    dom.step();
    const far = engine.current!.nodes.at(-1)!;
    expect(far.a).toBeLessThan(CONFIG.pickMinGrow);
    expect(engine.highlight(far.title)).toBe(false);
  });
});
