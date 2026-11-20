import { describe, expect, it } from 'vitest';
import { Discovery, type DiscoveryStore } from '../../src/comforts';
import type { Constellation, Star } from '../../src/types';

function star(title: string, subject: string): Star {
  return { title, subject, linksOut: true, linksIn: false, nameMatch: false, rank: 4, score: 0 };
}

function sky(center: string, subject: string, stars: Star[]): Constellation {
  return { center: { title: center, subject }, stars };
}

class MemoryStore implements DiscoveryStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('Discovery', () => {
  const jazz = sky('Jazz', 'Music', [star('Blues', 'Music'), star('New Orleans', 'Geography')]);
  const blues = sky('Blues', 'Music', [star('Jazz', 'Music'), star('Guitar', 'Music'), star('Mystery', 'Not a family')]);

  it('counts distinct articles and subjects across maps', () => {
    const d = new Discovery(null);
    expect(d.note(jazz)).toBe(3);
    expect(d.note(blues)).toBe(2);
    expect(d.note(jazz)).toBe(0);
    expect(d.count).toBe(5);
    expect(d.subjectCount).toBe(2);
    expect(d.label).toBe('5 articles · 2 subjects discovered');
  });

  it('words one of each in the singular and groups thousands', () => {
    const d = new Discovery(null);
    d.note(sky('Jazz', 'Music', []));
    expect(d.label).toBe('1 article · 1 subject discovered');
    d.note(
      sky(
        'Big',
        'Music',
        Array.from({ length: 1200 }, (_, i) => star('Star ' + i, 'Music')),
      ),
    );
    expect(d.label).toBe('1,202 articles · 1 subject discovered');
  });

  it('survives a reload through the store', () => {
    const store = new MemoryStore();
    new Discovery(store).note(jazz);
    const again = new Discovery(store);
    expect(again.count).toBe(3);
    expect(again.subjectCount).toBe(2);
    expect(again.note(jazz)).toBe(0);
    expect(again.note(blues)).toBe(2);
    expect(new Discovery(store).count).toBe(5);
  });

  it('forgets on reset, in the store too', () => {
    const store = new MemoryStore();
    const d = new Discovery(store);
    d.note(jazz);
    d.reset();
    expect(d.count).toBe(0);
    expect(new Discovery(store).count).toBe(0);
  });

  it('starts again from a damaged or failing store', () => {
    const store = new MemoryStore();
    store.data.set('astris.discovered.v1', '{"a":"nope","s":[4,"Music","Not a family"]');
    expect(new Discovery(store).count).toBe(0);
    store.data.set('astris.discovered.v1', '{"a":[1.5,"x",7],"s":[4,"Music","Not a family"]}');
    const d = new Discovery(store);
    expect(d.count).toBe(1);
    expect(d.subjectCount).toBe(1);
    const broken: DiscoveryStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const e = new Discovery(broken);
    expect(e.note(jazz)).toBe(3);
    expect(e.count).toBe(3);
  });
});
