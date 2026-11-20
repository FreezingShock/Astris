import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Discovery, PREVIEW_DELAY, Tip, firstLine, previewHtml, type DiscoveryStore, type SummarySource } from '../../src/comforts';
import type { StarNode } from '../../src/engine';
import type { ArticleSummary, Constellation, Star } from '../../src/types';

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

describe('firstLine', () => {
  it('keeps the first sentence only', () => {
    expect(firstLine('Jazz is a music genre. It began in New Orleans.')).toBe('Jazz is a music genre.');
    expect(firstLine('  One   sentence\n with no end ')).toBe('One sentence with no end');
    expect(firstLine('')).toBe('');
  });

  it('does not stop at initials, decimals or abbreviations before a number', () => {
    expect(firstLine('J. S. Bach was a composer. He wrote fugues.')).toBe('J. S. Bach was a composer.');
    expect(firstLine('It is 3.5 km long. Really.')).toBe('It is 3.5 km long.');
    expect(firstLine('The band (est. 1990) plays on. Still.')).toBe('The band (est. 1990) plays on.');
  });

  it('cuts a long sentence at a word and adds an ellipsis', () => {
    const line = firstLine('word '.repeat(80).trim() + '.', 40);
    expect(line.length).toBeLessThanOrEqual(41);
    expect(line.endsWith('word…')).toBe(true);
  });
});

describe('previewHtml', () => {
  const url = 'https://en.wikipedia.org/wiki/Jazz';

  it('shows the thumbnail, the first line and the licence', () => {
    const html = previewHtml({ title: 'Jazz', extract: 'Jazz is <b>music</b>. More.', thumbnail: 'https://upload.wikimedia.org/j.jpg', url });
    expect(html).toContain("<img src='https://upload.wikimedia.org/j.jpg'");
    expect(html).toContain('<p>Jazz is &lt;b&gt;music&lt;/b&gt;.</p>');
    expect(html).toContain('CC BY-SA 4.0');
  });

  it('drops a thumbnail that is not https and escapes quotes', () => {
    expect(previewHtml({ title: 'J', extract: 'Text.', thumbnail: 'javascript:alert(1)', url })).not.toContain('<img');
    expect(previewHtml({ title: 'J', extract: 'Text.', thumbnail: "https://x.org/a'onerror='x", url })).toContain("src='https://x.org/a&#39;onerror=&#39;x'");
    expect(previewHtml({ title: 'J', extract: '', url })).toBe('');
  });
});

describe('Tip', () => {
  const node = { title: 'Jazz', subject: 'Music', rank: 2, linksOut: true, linksIn: true, nameMatch: false } as StarNode;
  const other = { ...node, title: 'Blues' } as StarNode;
  const at = { x: 10, y: 10 };

  function setup(source: SummarySource): { el: HTMLElement; tip: Tip } {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '1, 2, 3' }));
    const el = { innerHTML: '', style: {} as Record<string, string>, offsetWidth: 200, offsetHeight: 80 } as unknown as HTMLElement;
    return { el, tip: new Tip(el, () => false, source) };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('adds the preview after a short rest, then answers from its cache', async () => {
    const source = vi.fn<SummarySource>((title) => Promise.resolve({ title, extract: title + ' is music. More.', url: 'https://x.org' }));
    const { el, tip } = setup(source);
    tip.show({ kind: 'star', node }, at, 800, 600);
    expect(el.innerHTML).toContain('<b>Jazz</b>');
    expect(el.innerHTML).not.toContain('pv');
    expect(source).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY);
    expect(el.innerHTML).toContain('<p>Jazz is music.</p>');
    tip.show(null, at, 800, 600);
    expect(el.style.display).toBe('none');
    tip.show({ kind: 'star', node }, at, 800, 600);
    expect(el.innerHTML).toContain('<p>Jazz is music.</p>');
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when the pointer only passes over', async () => {
    const source = vi.fn<SummarySource>((title) => Promise.resolve({ title, extract: 'x', url: 'https://x.org' }));
    const { tip } = setup(source);
    tip.show({ kind: 'star', node }, at, 800, 600);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY - 10);
    tip.show({ kind: 'star', node: other }, at, 800, 600);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY - 10);
    tip.show(null, at, 800, 600);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY * 3);
    expect(source).not.toHaveBeenCalled();
  });

  it('aborts a request the pointer has left and never shows it on another star', async () => {
    let signal: AbortSignal | undefined;
    let release: (s: ArticleSummary) => void = () => undefined;
    const source: SummarySource = (_title, sig) => {
      signal = sig;
      return new Promise((resolve) => (release = resolve));
    };
    const { el, tip } = setup(source);
    tip.show({ kind: 'star', node }, at, 800, 600);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY);
    tip.show({ kind: 'star', node: other }, at, 800, 600);
    expect(signal?.aborted).toBe(true);
    release({ title: 'Jazz', extract: 'Jazz text.', url: 'https://x.org' });
    await vi.advanceTimersByTimeAsync(0);
    expect(el.innerHTML).toContain('<b>Blues</b>');
    expect(el.innerHTML).not.toContain('Jazz text');
  });

  it('stays inside the map and survives a failed summary', async () => {
    const { el, tip } = setup(() => Promise.reject(new Error('offline')));
    tip.show({ kind: 'star', node }, { x: 790, y: 590 }, 800, 600);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY);
    expect(el.style.left).toBe('590px');
    expect(el.style.top).toBe('510px');
    expect(el.innerHTML).toContain('<b>Jazz</b>');
  });
});
