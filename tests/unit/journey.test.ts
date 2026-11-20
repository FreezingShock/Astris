import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import {
  FORMAT,
  FRESH_MS,
  Journey,
  JourneyStore,
  MAX_JOURNEYS,
  MAX_STEPS,
  decodePath,
  encodePath,
  migrate,
  pack,
  savedCon,
  unpack,
  validId,
  type StorageLike,
} from '../../src/journey';

/** A tiny in-memory localStorage with an optional size limit, so full storage can be tested. */
function memory(limit = Infinity): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const size = (): number => [...data.values()].reduce((n, v) => n + v.length, 0);
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => void data.delete(k),
    setItem(k, v) {
      if (size() - (data.get(k)?.length ?? 0) + v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
  };
}

const provider = new SampleProvider();
const PATH = ['Architecture', 'Brutalist architecture', 'Concrete', 'Brutalist architecture', 'Civil engineering'];

describe('share token', () => {
  it('round-trips a path, revisits and odd characters included', () => {
    const path = ['Café Müller', 'Zürich', 'Café Müller', '日本', 'AC/DC', 'Why? (a|b) & c'];
    expect(decodePath(encodePath(path))).toEqual(path);
  });

  it('is compact and url safe', () => {
    const token = encodePath(PATH);
    expect(token).toMatch(/^1\.[A-Za-z0-9_-]+\.[0-9a-z]{4}$/);
    expect(token.length).toBeLessThan(120);
  });

  it('keeps only the latest steps of a very long path', () => {
    const path = Array.from({ length: MAX_STEPS + 30 }, (_, i) => 'Article ' + i);
    const back = decodePath(encodePath(path));
    expect(back).toHaveLength(MAX_STEPS);
    expect(back?.[MAX_STEPS - 1]).toBe('Article ' + (MAX_STEPS + 29));
  });

  it('refuses damaged, foreign, newer and oversized tokens', () => {
    const good = encodePath(PATH);
    const [v, body, sum] = good.split('.') as [string, string, string];
    expect(decodePath(v + '.' + body.slice(0, -2) + '.' + sum)).toBeNull(); // body altered
    expect(decodePath(v + '.' + body + '.0000')).toBeNull(); // checksum wrong
    expect(decodePath('2.' + body + '.' + sum)).toBeNull(); // newer format
    expect(decodePath('')).toBeNull();
    expect(decodePath('hello')).toBeNull();
    expect(decodePath('1..')).toBeNull();
    expect(decodePath('x'.repeat(5000))).toBeNull();
    expect(decodePath(null as unknown as string)).toBeNull();
  });

  it('strips control characters from titles', () => {
    expect(decodePath(encodePath(['A\u0000b\n', 'C']))).toEqual(['Ab', 'C']);
  });
});

describe('saved constellations', () => {
  it('pack and unpack give the same constellation back', async () => {
    const data = await provider.constellation('Architecture');
    const back = unpack(JSON.parse(JSON.stringify(pack(data))));
    expect(back?.center).toEqual(data.center);
    expect(back?.stars.map((s) => [s.title, s.rank, s.linksOut, s.linksIn, s.nameMatch])).toEqual(data.stars.map((s) => [s.title, s.rank, s.linksOut, s.linksIn, s.nameMatch]));
  });

  it('rejects shapes that do not fit', () => {
    expect(unpack(null)).toBeNull();
    expect(unpack(['a', 'b', [['x', 'y', 1, 9, 0.5]]])).toBeNull(); // rank out of range
    expect(unpack(['a', 'b', [['x', 'y']]])).toBeNull();
    expect(unpack(['a', 5, []])).toBeNull();
  });
});

describe('store', () => {
  const record = (id: string, path = PATH, updated = 1000) => ({ v: FORMAT, id, created: updated, updated, path: [...path], cons: {} });

  it('saves and loads a journey', () => {
    const store = new JourneyStore(memory(), () => 5000);
    expect(store.save(record('abcdef1'))).toBe(true);
    const back = store.load('abcdef1');
    expect(back?.path).toEqual(PATH);
    expect(back?.updated).toBe(5000);
  });

  it('deletes a damaged record and survives it', () => {
    const mem = memory();
    mem.setItem('astris:journey:abcdef1', '{nope');
    const store = new JourneyStore(mem);
    expect(store.load('abcdef1')).toBeNull();
    expect(mem.data.has('astris:journey:abcdef1')).toBe(false);
  });

  it('leaves a record from a newer version alone and does not read it', () => {
    const mem = memory();
    mem.setItem('astris:journey:abcdef1', JSON.stringify({ ...record('abcdef1'), v: FORMAT + 1 }));
    const store = new JourneyStore(mem);
    expect(store.load('abcdef1')).toBeNull();
    expect(mem.data.has('astris:journey:abcdef1')).toBe(true);
  });

  it('refuses ids that are not ours, including path tricks', () => {
    const store = new JourneyStore(memory());
    expect(validId('../x')).toBe(false);
    expect(store.load('../x')).toBeNull();
    expect(store.load('A B')).toBeNull();
  });

  it('migrates records and drops bad parts', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({ v: 0, id: 'abcdef1', path: ['A'] })).toBeNull();
    expect(migrate({ v: 1, id: 'abcdef1', path: [] })).toBeNull();
    expect(migrate({ v: 1, id: 'abcdef1', path: ['A', 3] })).toBeNull();
    const ok = migrate({ v: 1, id: 'abcdef1', path: ['A', 'B'], cons: { A: ['A', 'x', []], B: 'junk' } });
    expect(Object.keys(ok?.cons ?? {})).toEqual(['A']);
  });

  it('keeps at most MAX_JOURNEYS and drops the oldest, and anything older than 30 days', () => {
    let t = 1_000_000;
    const store = new JourneyStore(memory(), () => t);
    for (let i = 0; i < MAX_JOURNEYS + 3; i++) {
      t += 1000;
      store.save(record('journey' + i));
    }
    store.sweep('journey' + (MAX_JOURNEYS + 2));
    const ids = store.list().map((r) => r.id);
    expect(ids).toHaveLength(MAX_JOURNEYS);
    expect(ids[0]).toBe('journey' + (MAX_JOURNEYS + 2));
    expect(ids).not.toContain('journey0');
    t += 40 * 86400_000;
    store.save(record('fresh01'));
    store.sweep('fresh01');
    expect(store.list().map((r) => r.id)).toEqual(['fresh01']);
  });

  it('makes room when storage is full, and falls back to the path alone', async () => {
    const mem = memory(900);
    let t = 1;
    const store = new JourneyStore(mem, () => ++t);
    store.save(record('older01'));
    const data = await provider.constellation('Architecture');
    const big = { ...record('newer01'), cons: { Architecture: pack(data) } };
    expect(store.save(big)).toBe(true);
    expect(store.load('newer01')?.path).toEqual(PATH);
    expect(store.load('older01')).toBeNull(); // evicted for the new one
  });

  it('works without any storage', () => {
    const store = new JourneyStore(null);
    expect(store.save(record('abcdef1'))).toBe(false);
    expect(store.load('abcdef1')).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it('trusts saved constellations only while they are fresh', async () => {
    const data = await provider.constellation('Architecture');
    const rec = { ...record('abcdef1', ['Architecture']), cons: { Architecture: pack(data) } };
    expect(savedCon(rec, 'Architecture', rec.updated + 1000)?.center.title).toBe('Architecture');
    expect(savedCon(rec, 'Architecture', rec.updated + FRESH_MS + 1)).toBeNull();
    expect(savedCon(rec, 'Elsewhere', rec.updated)).toBeNull();
  });
});

describe('journey', () => {
  it('leaves nothing behind until the reader travels, then saves each step', async () => {
    const mem = memory();
    const j = new Journey(new JourneyStore(mem));
    const a = await provider.constellation('Architecture');
    j.begin(a);
    expect(j.id).toBeNull();
    expect(mem.data.size).toBe(0);
    j.step(await provider.constellation(a.stars[0]?.title ?? ''));
    expect(j.id).toMatch(/^[a-z0-9]+$/);
    expect(j.steps).toBe(2);
    expect(new JourneyStore(mem).load(j.id ?? '')?.path).toEqual([...j.path]);
    expect(decodePath(j.token ?? '')).toEqual([...j.path]);
  });

  it('detach stops recording but keeps what was saved', async () => {
    const mem = memory();
    const j = new Journey(new JourneyStore(mem));
    const a = await provider.constellation('Architecture');
    j.begin(a);
    j.step(await provider.constellation(a.stars[0]?.title ?? ''));
    const id = j.id;
    j.detach();
    expect(j.id).toBeNull();
    expect(new JourneyStore(mem).load(id ?? '')).not.toBeNull();
  });

  it('adopts a shared path as a journey of its own', async () => {
    const mem = memory();
    const j = new Journey(new JourneyStore(mem));
    const a = await provider.constellation('Architecture');
    const b = await provider.constellation(a.stars[0]?.title ?? '');
    j.adoptPath([a, b]);
    expect(j.id).not.toBeNull();
    expect(new JourneyStore(mem).load(j.id ?? '')?.path).toEqual([a.center.title, b.center.title]);
  });
});
