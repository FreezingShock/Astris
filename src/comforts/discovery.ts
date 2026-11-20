import type { Constellation } from '../types';

/** Counts every distinct article the reader has seen on the map. */
export class Discovery {
  private readonly seen = new Set<string>();

  get count(): number {
    return this.seen.size;
  }

  reset(): void {
    this.seen.clear();
  }

  note(data: Constellation): void {
    this.seen.add(data.center.title);
    for (const s of data.stars) this.seen.add(s.title);
  }
}
