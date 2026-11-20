import { describe, expect, it } from 'vitest';
import { nextStop } from '../../src/modes';

describe('nextStop', () => {
  it('prefers neighbours not seen recently', () => {
    expect(nextStop(['A', 'B', 'C'], ['A', 'B'], () => 0)).toBe('C');
  });
  it('falls back to any neighbour when all were seen', () => {
    expect(nextStop(['A', 'B'], ['A', 'B'], () => 0.99)).toBe('B');
  });
  it('returns null with no neighbours', () => {
    expect(nextStop([], [], () => 0)).toBeNull();
  });
  it('favours the closest ties', () => {
    expect(nextStop(['A', 'B', 'C', 'D'], [], () => 0.5)).toBe('B');
  });
});
