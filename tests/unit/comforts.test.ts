import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Discovery,
  PREVIEW_DELAY,
  Share,
  StarCursor,
  Tip,
  tieLine,
  announce,
  firstLine,
  nextStar,
  previewHtml,
  readShare,
  shareNote,
  shareSearch,
  shareUrl,
} from '../../src/comforts';
import type { DiscoveryStore, ShareState, StarReach, SummarySource } from '../../src/comforts';
import type { Con, StarNode } from '../../src/engine';
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

describe('keyboard travel', () => {
  const at = (title: string, sx: number, sy: number, on = true): StarNode => ({ title, subject: 'Music', rank: 3, sx, sy, on, a: 1 }) as StarNode;
  const east = at('East', 100, 5);
  const farEast = at('Far east', 220, 0);
  const north = at('North', 10, -80);
  const northEast = at('North east', 60, -70);
  const hidden = at('Hidden', 40, 0, false);
  const nodes = [east, farEast, north, northEast, hidden];
  const origin = { x: 0, y: 0 };

  function setup(): { cursor: StarCursor; map: StarReach & { current: Con | null; trail: string[] }; calls: string[] } {
    const calls: string[] = [];
    const map = {
      current: { title: 'Centre', cx: 0, cy: 0, nodes } as Con as Con | null,
      trail: ['Start', 'Centre'],
      highlight: (title: string | null) => calls.push('ring ' + title) > 0,
      zoomBy: (f: number) => void calls.push('zoom ' + f.toFixed(2)),
      fit: () => void calls.push('fit'),
    };
    const cursor = new StarCursor({ map, go: (title) => void calls.push('go ' + title) }, (text) => void calls.push('say ' + text));
    return { cursor, map, calls };
  }

  it('picks the nearest star in the arrow direction and skips hidden ones', () => {
    expect(nextStar(nodes, origin, 'right')).toBe(east);
    expect(nextStar(nodes, origin, 'up')).toBe(north);
    expect(nextStar(nodes, origin, 'left')).toBeNull();
    expect(nextStar(nodes, origin, 'down')).toBeNull();
    expect(nextStar(nodes, { x: east.sx, y: east.sy }, 'right', east)).toBe(farEast);
    expect(nextStar(nodes, { x: east.sx, y: east.sy }, 'up', east)).toBe(northEast);
  });

  it('walks from the centre, rings the star and says its name', () => {
    const { cursor, calls } = setup();
    expect(cursor.key('ArrowRight')).toBe(true);
    expect(cursor.selected).toBe(east);
    expect(cursor.key('ArrowRight')).toBe(true);
    expect(cursor.selected).toBe(farEast);
    expect(cursor.key('ArrowRight')).toBe(true); // nothing further: stay put
    expect(cursor.selected).toBe(farEast);
    expect(calls).toEqual(['ring East', 'say ' + announce(east), 'ring Far east', 'say ' + announce(farEast)]);
    expect(announce(east)).toBe('East, Music, rank 3. Press Enter to travel there.');
  });

  it('travels on Enter, lets go on Escape and goes back on Backspace', () => {
    const { cursor, calls } = setup();
    expect(cursor.key('Enter')).toBe(false);
    expect(cursor.key('Escape')).toBe(false);
    cursor.key('ArrowUp');
    expect(cursor.key('Escape')).toBe(true);
    expect(cursor.selected).toBeNull();
    cursor.key('ArrowUp');
    expect(cursor.key('Enter')).toBe(true);
    expect(cursor.selected).toBeNull();
    expect(cursor.key('Backspace')).toBe(true);
    expect(calls.filter((c) => !c.startsWith('say'))).toEqual(['ring North', 'ring null', 'ring North', 'ring null', 'go North', 'go Start']);
  });

  it('forgets its star when the map moves on, and zooms', () => {
    const { cursor, map, calls } = setup();
    cursor.key('ArrowRight');
    map.current = { title: 'Next', cx: 0, cy: 0, nodes: [] as StarNode[] } as Con;
    expect(cursor.selected).toBeNull();
    expect(cursor.key('Enter')).toBe(false);
    map.trail = ['Next'];
    expect(cursor.key('Backspace')).toBe(false);
    expect(cursor.key('+')).toBe(true);
    expect(cursor.key('-')).toBe(true);
    expect(cursor.key('0')).toBe(true);
    expect(cursor.key('x')).toBe(false);
    expect(calls.slice(2)).toEqual(['zoom 1.40', 'zoom 0.71', 'fit']);
    map.current = null;
    expect(cursor.key('ArrowLeft')).toBe(false);
  });
});

describe('share links', () => {
  const explore: ShareState = { mode: 'explore', article: 'Brutalist architecture' };
  const race: ShareState = { mode: 'race', start: 'Brutalist architecture', target: 'Jazz' };

  it('writes readable queries and reads them back', () => {
    expect(shareSearch(explore)).toBe('?a=Brutalist%20architecture');
    expect(shareSearch(race)).toBe('?race=Brutalist%20architecture|Jazz');
    expect(readShare(shareSearch(explore))).toEqual(explore);
    expect(readShare(shareSearch(race))).toEqual(race);
    const odd: ShareState = { mode: 'explore', article: 'AC/DC & "Rock+Roll"? 100%' };
    expect(readShare(shareSearch(odd))).toEqual(odd);
    expect(shareUrl(race, 'https://astris.example/')).toBe('https://astris.example/play?race=Brutalist%20architecture|Jazz');
  });

  it('ignores links that name nothing', () => {
    expect(readShare('')).toBeNull();
    expect(readShare('?a=%20')).toBeNull();
    expect(readShare('?race=Jazz')).toBeNull();
    expect(readShare('?race=A|B|C')).toBeNull();
    expect(readShare('?race=Jazz&a=Blues')).toEqual({ mode: 'explore', article: 'Blues' });
  });

  describe('Share', () => {
    function setup(
      path: string,
      search: string,
      clipboard: boolean,
    ): { share: Share; replaced: string[]; toasts: string[]; copied: string[]; now: { state: ShareState | null; onMap: boolean } } {
      const replaced: string[] = [];
      const toasts: string[] = [];
      const copied: string[] = [];
      const now: { state: ShareState | null; onMap: boolean } = { state: explore, onMap: true };
      const loc = { pathname: path, search, origin: 'https://astris.example' };
      vi.stubGlobal('location', loc);
      vi.stubGlobal('history', {
        state: null,
        replaceState: (_s: unknown, _t: string, url: string) => {
          replaced.push(url);
          loc.search = url.slice(url.indexOf('?'));
        },
      });
      vi.stubGlobal('navigator', {
        clipboard: { writeText: (text: string) => (clipboard ? Promise.resolve(void copied.push(text)) : Promise.reject(new Error('denied'))) },
      });
      vi.stubGlobal('document', { createElement: () => ({ addEventListener: () => undefined }) });
      const host = { prepend: () => undefined } as unknown as HTMLElement;
      const share = new Share({ host, state: () => now.state, onMap: () => now.onMap, toast: (m) => void toasts.push(m) });
      return { share, replaced, toasts, copied, now };
    }

    afterEach(() => vi.unstubAllGlobals());

    it('keeps the address bar on the current article and mode', () => {
      const { share, replaced, now } = setup('/play', '', true);
      share.sync();
      share.sync();
      now.state = race;
      share.sync();
      expect(replaced).toEqual(['/play?a=Brutalist%20architecture', '/play?race=Brutalist%20architecture|Jazz']);
    });

    it('leaves the address bar alone off the map', () => {
      const off = setup('/play', '', true);
      off.now.onMap = false;
      off.share.sync();
      off.now.onMap = true;
      off.now.state = null;
      off.share.sync();
      expect(off.replaced).toEqual([]);
      const site = setup('/design-system', '', true);
      site.share.sync();
      expect(site.replaced).toEqual([]);
    });

    it('copies the link and says what it opens', async () => {
      const { share, toasts, copied, now } = setup('/play/', '', true);
      expect(await share.copy()).toBe('https://astris.example/play?a=Brutalist%20architecture');
      now.state = race;
      await share.copy();
      expect(copied).toEqual(['https://astris.example/play?a=Brutalist%20architecture', 'https://astris.example/play?race=Brutalist%20architecture|Jazz']);
      expect(toasts).toEqual([shareNote(explore), 'Link copied. It starts the race from Brutalist architecture to Jazz.']);
      now.state = null;
      expect(await share.copy()).toBeNull();
    });

    it('points at the address bar when the clipboard is closed', async () => {
      const { share, toasts, replaced } = setup('/play', '', false);
      await share.copy();
      expect(replaced).toEqual(['/play?a=Brutalist%20architecture']);
      expect(toasts).toEqual(['Could not reach the clipboard. Copy the link from the address bar.']);
    });
  });
});

describe('tieLine', () => {
  it('puts a tie in plain words', () => {
    expect(tieLine({ linksOut: true, linksIn: true, nameMatch: false, rank: 2 }, 'Bridge')).toBe('Close tie: links both ways with Bridge');
    expect(tieLine({ linksOut: true, linksIn: false, nameMatch: true, rank: 3 }, 'Bridge')).toBe('Fair tie: is linked from Bridge, and a similar name');
    expect(tieLine({ linksOut: false, linksIn: false, nameMatch: true, rank: 5 }, null)).toBe('Loose tie: has a name like this article');
  });
});
