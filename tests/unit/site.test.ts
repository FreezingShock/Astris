import { describe, expect, it } from 'vitest';
import { clock, esc, hash } from '../../src/lib';
import { racePairOf, routeOf } from '../../src/site/router';

describe('router', () => {
  it('maps paths to routes', () => {
    expect(routeOf({ pathname: '/', hash: '' })).toBe('main-page');
    expect(routeOf({ pathname: '/design-system', hash: '' })).toBe('design-system');
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
