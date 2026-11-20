import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleProvider } from '../../src/data';
import { CONFIG } from '../../src/engine/config';
import { Engine } from '../../src/engine/engine';
import { fakeDom } from './helpers/fake-dom';

// These tests run thousands of simulated frames on a fake clock. The result never depends on wall time,
// but a busy CI worker can take several times longer than a laptop, so the budget is generous.
vi.setConfig({ testTimeout: 30_000 });
afterEach(() => vi.unstubAllGlobals());
const provider = new SampleProvider();

async function grown(): Promise<{ engine: Engine; dom: ReturnType<typeof fakeDom> }> {
  const dom = fakeDom(1200, 800);
  const engine = new Engine(dom.canvas);
  engine.enable();
  engine.reset(await provider.constellation('Architecture'));
  dom.run(5000);
  engine.travel(await provider.constellation('Jazz'));
  dom.run(5000);
  return { engine, dom };
}

describe('adaptive detail', () => {
  it('drops detail when frames come slowly and restores it after a calm stretch', async () => {
    const { engine, dom } = await grown();
    expect(engine.detail).toBe(0);
    dom.run(6000, 50);
    expect(engine.detail).toBeGreaterThan(0);
    dom.run(20000, 8);
    expect(engine.detail).toBe(0);
  });

  it('never goes past the highest level', async () => {
    const { engine, dom } = await grown();
    dom.run(20000, 90);
    expect(engine.detail).toBeLessThanOrEqual(CONFIG.lodMax);
  });
});

describe('viewport culling', () => {
  it('does not walk a constellation that is wholly off screen, and cannot pick its stars', async () => {
    const { engine, dom } = await grown();
    const old = engine.memories[0]!;
    expect(old.vis).toBe(true);
    engine.zoomBy(3);
    dom.run(200);
    const far = engine.current!;
    // pan the view far away by dragging
    for (let i = 0; i < 40; i++) {
      dom.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      dom.fire('pointermove', { pointerId: 1, clientX: 1100, clientY: 100 });
      dom.fire('pointerup', { pointerId: 1, clientX: 1100, clientY: 100 });
    }
    dom.run(300);
    const hidden = [old, far].filter((c) => c.vis === false);
    expect(hidden.length).toBeGreaterThan(0);
    for (const c of hidden) expect(c.count).toBe(0);
  });
});

describe('pan glide', () => {
  it('keeps drifting after the pointer lets go and then comes to rest', async () => {
    const { engine, dom } = await grown();
    const x0 = engine.current!.cx;
    dom.fire('pointerdown', { pointerId: 1, clientX: 600, clientY: 400 });
    for (let i = 1; i <= 6; i++) {
      dom.step(16);
      dom.fire('pointermove', { pointerId: 1, clientX: 600 + i * 30, clientY: 400 });
    }
    dom.fire('pointerup', { pointerId: 1, clientX: 780, clientY: 400 });
    const atRelease = engine.current!.cx;
    dom.run(300);
    const later = engine.current!.cx;
    expect(later).toBeGreaterThan(atRelease + 1);
    dom.run(6000);
    const rest = engine.current!.cx;
    dom.run(500);
    expect(engine.current!.cx).toBeCloseTo(rest, 0);
    expect(rest).not.toBeCloseTo(x0, 0);
  });
});
