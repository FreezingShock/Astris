import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import { par, randomPair } from '../../src/modes/race';

describe('par', () => {
  const provider = new SampleProvider();

  it('finds the fewest clicks for the main page race', async () => {
    expect(await par(provider, 'Brutalist architecture', 'Jazz')).toBe(4);
  });

  it('is zero for the same article and one for a neighbour', async () => {
    expect(await par(provider, 'Jazz', 'Jazz')).toBe(0);
    expect(await par(provider, 'Jazz', 'Music')).toBe(1);
  });

  it('gives up beyond the depth cap', async () => {
    expect(await par(provider, 'Brutalist architecture', 'Jazz', 3)).toBe(-1);
  });

  it('picks random pairs three or four clicks apart', async () => {
    const pair = await randomPair(provider);
    expect(pair.start).not.toBe(pair.target);
    expect(pair.par).toBeGreaterThanOrEqual(3);
    expect(pair.par).toBeLessThanOrEqual(4);
    expect(await par(provider, pair.start, pair.target)).toBe(pair.par);
  });
});
