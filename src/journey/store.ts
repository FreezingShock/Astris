import { FORMAT, MAX_STEPS, cleanTitle, pack, unpack, validId, type PackedCon } from './codec';
import type { Constellation } from '../types';

/** The part of localStorage the store needs, so tests can hand in their own. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PREFIX = 'astris:journey:';
/** Journeys kept at once. The oldest leave first. */
export const MAX_JOURNEYS = 8;
/** A journey untouched for this long is dropped. */
export const MAX_AGE_MS = 30 * 86400_000;
/** Saved constellations older than this are fetched again instead of trusted. */
export const FRESH_MS = 7 * 86400_000;
/** The most characters one journey, and all journeys together, may take. */
export const MAX_RECORD = 300_000;
export const MAX_TOTAL = 2_000_000;

/** What is kept for one journey. */
export interface JourneyRecord {
  v: number;
  id: string;
  created: number;
  updated: number;
  /** Centres in the order they were visited, revisits included. */
  path: string[];
  /** The constellation of each centre, by title. May be empty; the path alone is enough to rebuild. */
  cons: Record<string, PackedCon>;
}

/**
 * Bring a record of any known version up to the current one, or return null when it cannot be trusted:
 * not an object, damaged, or written by a newer version of Astris than this one.
 */
export function migrate(raw: unknown): JourneyRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.v !== 'number' || r.v < 1 || r.v > FORMAT) return null;
  if (!validId(r.id) || !Array.isArray(r.path)) return null;
  const path: string[] = [];
  for (const t of r.path) {
    const c = cleanTitle(t);
    if (!c) return null;
    path.push(c);
  }
  if (!path.length || path.length > MAX_STEPS) return null;
  const cons: Record<string, PackedCon> = {};
  if (r.cons && typeof r.cons === 'object') {
    for (const [title, packed] of Object.entries(r.cons as Record<string, unknown>)) {
      // A constellation that no longer fits the shape is simply fetched again later.
      if (unpack(packed)) cons[title] = packed as PackedCon;
    }
  }
  const created = typeof r.created === 'number' ? r.created : 0;
  const updated = typeof r.updated === 'number' ? r.updated : created;
  return { v: FORMAT, id: r.id, created, updated, path, cons };
}

/** Every journey saved in this browser, behind keys that cannot clash with anything else. All failures are swallowed: saving is a convenience. */
export class JourneyStore {
  constructor(
    private readonly storage: StorageLike | null,
    private readonly now: () => number = Date.now,
  ) {}

  private key(id: string): string {
    return PREFIX + id;
  }

  /** One journey, or null when it is missing, damaged or from a newer version. A damaged one is deleted. */
  load(id: string): JourneyRecord | null {
    if (!validId(id) || !this.storage) return null;
    let text: string | null;
    try {
      text = this.storage.getItem(this.key(id));
    } catch {
      return null;
    }
    if (text === null) return null;
    try {
      const rec = migrate(JSON.parse(text));
      if (rec && rec.id === id) return rec;
      // A record from a newer version is left alone; anything else is junk.
      if (!this.isNewer(text)) this.remove(id);
    } catch {
      this.remove(id);
    }
    return null;
  }

  private isNewer(text: string): boolean {
    try {
      const v = (JSON.parse(text) as { v?: unknown }).v;
      return typeof v === 'number' && v > FORMAT;
    } catch {
      return false;
    }
  }

  /** Ids saved here, newest first. */
  list(): JourneyRecord[] {
    const s = this.storage;
    if (!s) return [];
    const ids: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX)) ids.push(k.slice(PREFIX.length));
      }
    } catch {
      return [];
    }
    return ids
      .map((id) => this.load(id))
      .filter((r): r is JourneyRecord => r !== null)
      .sort((a, b) => b.updated - a.updated);
  }

  /** The journey touched most recently, if it has at least `min` steps. */
  latest(min = 2): JourneyRecord | null {
    const r = this.list()[0];
    return r && r.path.length >= min ? r : null;
  }

  remove(id: string): void {
    try {
      this.storage?.removeItem(this.key(id));
    } catch {
      /* nothing to do */
    }
  }

  /** Drop journeys that are too old, then the oldest beyond the limit. Never touches `keep`. */
  sweep(keep?: string): void {
    const all = this.list();
    const cutoff = this.now() - MAX_AGE_MS;
    for (const r of all) if (r.id !== keep && r.updated < cutoff) this.remove(r.id);
    const rest = all.filter((r) => r.id === keep || r.updated >= cutoff);
    for (const r of rest.slice(MAX_JOURNEYS).reverse()) if (r.id !== keep) this.remove(r.id);
  }

  /**
   * Save a journey. When the browser is full, older journeys go first, then this one loses its saved
   * constellations (the path still rebuilds it). Returns false only when nothing could be saved.
   */
  save(rec: JourneyRecord): boolean {
    if (!this.storage) return false;
    rec.updated = this.now();
    let text = JSON.stringify(rec);
    if (text.length > MAX_RECORD) {
      rec = { ...rec, cons: this.newest(rec) };
      text = JSON.stringify(rec);
      if (text.length > MAX_RECORD) text = JSON.stringify({ ...rec, cons: {} });
    }
    if (this.write(rec.id, text)) return true;
    // Full: let the oldest other journeys go until it fits.
    for (const other of this.list().reverse()) {
      if (other.id === rec.id) continue;
      this.remove(other.id);
      if (this.write(rec.id, text)) return true;
    }
    return this.write(rec.id, JSON.stringify({ ...rec, cons: {} }));
  }

  /** Keep the constellations of the latest centres only, newest first, until the record fits. */
  private newest(rec: JourneyRecord): Record<string, PackedCon> {
    const out: Record<string, PackedCon> = {};
    let size = 0;
    for (const title of [...rec.path].reverse()) {
      const c = rec.cons[title];
      if (!c || out[title]) continue;
      const n = JSON.stringify(c).length;
      if (size + n > MAX_RECORD / 2) break;
      out[title] = c;
      size += n;
    }
    return out;
  }

  private write(id: string, text: string): boolean {
    try {
      this.storage?.setItem(this.key(id), text);
      return true;
    } catch {
      return false;
    }
  }
}

/** The reader's own storage, or null where the browser refuses it. */
export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem(PREFIX);
    return s;
  } catch {
    return null;
  }
}

/** The constellation saved for a centre, if it is still fresh enough to trust. */
export function savedCon(rec: JourneyRecord, title: string, now: number): Constellation | null {
  if (now - rec.updated > FRESH_MS) return null;
  const p = rec.cons[title];
  return p ? unpack(p) : null;
}

export { pack };
