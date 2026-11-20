import { FORMAT, MAX_STEPS, encodePath, newId, pack } from './codec';
import { JourneyStore, type JourneyRecord } from './store';
import type { Constellation } from '../types';

/**
 * The journey of one tab: the ordered path of centres and what each looked like.
 * It saves nothing until the reader has travelled once, so opening the map and leaving leaves no trace.
 */
export class Journey {
  private rec: JourneyRecord | null = null;
  /** True once the journey is in storage, so it has an address worth putting in the URL. */
  private saved = false;

  constructor(
    private readonly store: JourneyStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** The id to put in the address bar, or null until there is something saved under it. */
  get id(): string | null {
    return this.saved && this.rec ? this.rec.id : null;
  }

  get path(): readonly string[] {
    return this.rec?.path ?? [];
  }

  get steps(): number {
    return this.rec?.path.length ?? 0;
  }

  /** The compact token that rebuilds this path anywhere, or null for a path of one. */
  get token(): string | null {
    return this.rec && this.rec.path.length >= 2 ? encodePath(this.rec.path) : null;
  }

  /** A new journey that starts at this constellation. */
  begin(data: Constellation): void {
    const t = this.now();
    this.rec = { v: FORMAT, id: newId(), created: t, updated: t, path: [data.center.title], cons: { [data.center.title]: pack(data) } };
    this.saved = false;
  }

  /** Carry on from a saved record, for example after a refresh. New steps are added to it. */
  adopt(rec: JourneyRecord): void {
    this.rec = rec;
    this.saved = true;
  }

  /** A journey rebuilt from a shared path: it gets an id of its own and is saved once, whole. */
  adoptPath(datas: readonly Constellation[]): void {
    const first = datas[0];
    if (!first) return;
    this.begin(first);
    const rec = this.rec;
    if (!rec) return;
    rec.path = datas.map((d) => d.center.title);
    for (const d of datas) rec.cons[d.center.title] = pack(d);
    this.saved = rec.path.length >= 2 && this.store.save(rec);
  }

  /** The reader travelled to a constellation. Starts a journey at it when there is none. */
  step(data: Constellation): void {
    if (!this.rec) return this.begin(data);
    const rec = this.rec;
    rec.path.push(data.center.title);
    rec.cons[data.center.title] = pack(data);
    while (rec.path.length > MAX_STEPS) {
      const gone = rec.path.shift();
      if (gone && !rec.path.includes(gone)) delete rec.cons[gone];
    }
    this.saved = this.store.save(rec);
    if (this.saved && rec.path.length === 2) this.store.sweep(rec.id);
  }

  /** Stop recording, for example when a race starts. What was saved stays saved. */
  detach(): void {
    this.rec = null;
    this.saved = false;
  }
}
