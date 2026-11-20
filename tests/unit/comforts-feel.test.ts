import { describe, expect, it } from 'vitest';
import { SPARKS, Sound, SOUND_KEY, TOUR_STEPS, flourish, makeSparks, noteFor, stepSparks, tierOf } from '../../src/comforts';

function store(initial?: string): { map: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const map = new Map<string, string>();
  if (initial) map.set(SOUND_KEY, initial);
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('arrival notes', () => {
  it('gives a title the same note every time, from the scale', () => {
    expect(noteFor('Jazz')).toBe(noteFor('Jazz'));
    expect(noteFor('Jazz')).toBeGreaterThan(300);
    expect(noteFor('Jazz')).toBeLessThan(1100);
  });
  it('plays more notes for a better finish', () => {
    expect(flourish('finish').length).toBeLessThan(flourish('par').length);
    expect(flourish('par').length).toBeLessThan(flourish('under').length);
    expect(flourish('under')).toEqual([...flourish('under')].sort((a, b) => a - b));
  });
});

describe('finish tiers', () => {
  it('compares clicks with par', () => {
    expect(tierOf(3, 4)).toBe('under');
    expect(tierOf(4, 4)).toBe('par');
    expect(tierOf(6, 4)).toBe('finish');
    expect(tierOf(2, null)).toBe('finish');
    expect(tierOf(2, -1)).toBe('finish');
  });
});

describe('Sound', () => {
  it('is off by default and remembers the choice', () => {
    const s = store();
    const sound = new Sound(s);
    expect(sound.enabled).toBe(false);
    sound.set(true);
    expect(s.map.get(SOUND_KEY)).toBe('on');
    expect(new Sound(s).enabled).toBe(true);
    sound.set(false);
    expect(new Sound(s).enabled).toBe(false);
  });
  it('stays quiet and does not throw without an audio system, on or off', () => {
    const sound = new Sound(store());
    expect(() => {
      sound.arrive('Jazz');
      sound.win('under');
      sound.set(true);
      sound.arrive('Jazz');
      sound.win('par');
    }).not.toThrow();
  });
  it('survives storage that throws', () => {
    const bad = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    const sound = new Sound(bad);
    expect(sound.enabled).toBe(false);
    expect(() => sound.set(true)).not.toThrow();
    expect(sound.enabled).toBe(true);
  });
});

describe('celebration sparks', () => {
  const rand = (): number => 0.5;
  it('throws more sparks for a better finish, all from the given point', () => {
    for (const tier of ['finish', 'par', 'under'] as const) {
      const sparks = makeSparks(tier, 10, 20, 5, rand);
      expect(sparks).toHaveLength(SPARKS[tier]);
      expect(sparks.every((s) => s.x === 10 && s.y === 20 && s.colour < 5)).toBe(true);
    }
    expect(SPARKS.finish).toBeLessThan(SPARKS.par);
    expect(SPARKS.par).toBeLessThan(SPARKS.under);
  });
  it('lets sparks rise, fall and die', () => {
    let sparks = makeSparks('par', 0, 0, 3, rand);
    const up = Math.min(...stepSparks(sparks, 0.1).map((s) => s.y));
    expect(up).toBeLessThan(0);
    for (let i = 0; i < 100; i++) sparks = stepSparks(sparks, 0.05);
    expect(sparks).toHaveLength(0);
  });
});

describe('tutorial', () => {
  it('teaches by doing, in a short sequence that ends on a choice', () => {
    expect(TOUR_STEPS.map((s) => s.on)).toEqual(['travel', 'look', 'search', 'button']);
    expect(TOUR_STEPS.every((s) => s.title && s.body)).toBe(true);
  });
});
