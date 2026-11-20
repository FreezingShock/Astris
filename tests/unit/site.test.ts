import { describe, expect, it } from 'vitest';
import { clock, esc, hash } from '../../src/lib';
import { articleOf, dispatchPlayLink, onPlayLink, playUrl, racePairOf, routeOf } from '../../src/site/router';

describe('router', () => {
  it('maps paths to routes', () => {
    expect(routeOf({ pathname: '/', hash: '' })).toBe('main-page');
    expect(routeOf({ pathname: '/design-system', hash: '' })).toBe('main-page');
    expect(routeOf({ pathname: '/play/', hash: '' })).toBe('play');
    expect(routeOf({ pathname: '/nowhere', hash: '' })).toBe('main-page');
  });

  it('still understands the mockup hash links', () => {
    expect(routeOf({ pathname: '/', hash: '#play' })).toBe('play');
    expect(routeOf({ pathname: '/', hash: '#ds-colour' })).toBe('main-page');
  });

  it('reads a race pair', () => {
    expect(racePairOf('?race=Brutalist%20architecture|Jazz')).toEqual({ start: 'Brutalist architecture', target: 'Jazz' });
    expect(racePairOf('?race=Jazz')).toBeNull();
    expect(racePairOf('')).toBeNull();
  });
});

describe('play links', () => {
  it('builds a map address and leaves out empty values', () => {
    expect(playUrl()).toBe('/play');
    expect(playUrl({ a: 'Brutalist architecture', mode: undefined, x: '' })).toBe('/play?a=Brutalist+architecture');
  });

  it('offers a query to handlers in order until one takes it', () => {
    const seen: string[] = [];
    const offFirst = onPlayLink((q) => {
      seen.push('first');
      return q.has('a');
    });
    const offSecond = onPlayLink(() => {
      seen.push('second');
      return true;
    });
    expect(dispatchPlayLink('?a=Jazz')).toBe(true);
    expect(seen).toEqual(['first']);
    expect(dispatchPlayLink('?race=A|B')).toBe(true);
    expect(seen).toEqual(['first', 'first', 'second']);
    offFirst();
    offSecond();
    expect(dispatchPlayLink('?a=Jazz')).toBe(false);
  });

  it('reads a shared article', () => {
    expect(articleOf('?a=Brutalist%20architecture')).toBe('Brutalist architecture');
    expect(articleOf('?a=%20')).toBeNull();
    expect(articleOf('?race=A|B')).toBeNull();
  });

  it('ignores an empty query', () => {
    const off = onPlayLink(() => true);
    expect(dispatchPlayLink('')).toBe(false);
    off();
  });
});

describe('lib', () => {
  it('hashes deterministically to 32 bits', () => {
    expect(hash('Astris')).toBe(hash('Astris'));
    expect(hash('Astris')).not.toBe(hash('astris'));
    expect(hash('')).toBe(2166136261);
  });

  it('escapes HTML and formats the clock', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(clock(0)).toBe('00:00');
    expect(clock(75_000)).toBe('01:15');
    expect(clock(600_000)).toBe('10:00');
  });
});
