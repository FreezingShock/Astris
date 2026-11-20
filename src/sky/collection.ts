import { hash } from '../lib';
import { SUBJECTS } from '../styles';

/** The part of localStorage the collection needs, so tests can hand in their own. */
export interface CollectionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One article the reader has travelled to. */
export interface Collected {
  title: string;
  subject: string;
  /** When it was first collected, in ms since 1970. */
  at: number;
}

/** How far a region has been explored, by how many of its articles are collected. */
export const TIERS = [
  { min: 1, name: 'Glimmering' },
  { min: 5, name: 'Charted' },
  { min: 15, name: 'Mastered' },
] as const;

/** One real article per region, offered as the way to light it. */
export const SEEDS: Readonly<Record<string, string>> = {
  Architecture: 'Gothic architecture',
  'Urban planning': 'Zoning',
  'Civil engineering': 'Suspension bridge',
  'Sustainable design': 'Green roof',
  Astronomy: 'Black hole',
  Music: 'Jazz',
  Biology: 'Photosynthesis',
  Philosophy: 'Stoicism',
  'Computer science': 'Algorithm',
  History: 'Roman Empire',
  Geography: 'Himalayas',
  'Video game': 'Roguelike',
};

const BUILT = ['Architecture', 'Urban planning', 'Civil engineering', 'Sustainable design'];

export interface Achievement {
  id: string;
  name: string;
  text: string;
  /** How far along the reader is, and how far they need to get. */
  progress(c: Collection): { have: number; need: number };
}

const stars = (need: number) => (c: Collection) => ({ have: Math.min(c.count, need), need });
const lit = (need: number) => (c: Collection) => ({ have: Math.min(c.regionsLit, need), need });

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-light', name: 'First light', text: 'Travel to your first star.', progress: stars(1) },
  { id: 'wanderer', name: 'Wanderer', text: 'Collect 10 stars.', progress: stars(10) },
  { id: 'navigator', name: 'Navigator', text: 'Collect 50 stars.', progress: stars(50) },
  { id: 'cartographer', name: 'Cartographer', text: 'Collect 250 stars.', progress: stars(250) },
  { id: 'stargazer', name: 'Stargazer', text: 'Collect 1,000 stars.', progress: stars(1000) },
  { id: 'three-colours', name: 'Three colours', text: 'Light 3 regions.', progress: lit(3) },
  { id: 'spectrum', name: 'Spectrum', text: 'Light 6 regions.', progress: lit(6) },
  { id: 'full-spectrum', name: 'Full spectrum', text: 'Light all 12 regions.', progress: lit(12) },
  {
    id: 'specialist',
    name: 'Specialist',
    text: 'Master one region with 15 stars.',
    progress: (c) => ({ have: Math.min(Math.max(0, ...SUBJECTS.map((s) => c.countIn(s))), 15), need: 15 }),
  },
  {
    id: 'polymath',
    name: 'Polymath',
    text: 'Chart 5 regions with 5 stars each.',
    progress: (c) => ({ have: Math.min(SUBJECTS.filter((s) => c.countIn(s) >= 5).length, 5), need: 5 }),
  },
  {
    id: 'built-environment',
    name: 'Built environment',
    text: 'Light Architecture, Urban planning, Civil engineering and Sustainable design.',
    progress: (c) => ({ have: BUILT.filter((s) => c.countIn(s) > 0).length, need: BUILT.length }),
  },
  {
    id: 'bridge-builder',
    name: 'Bridge builder',
    text: 'Cross from one subject to another 10 times.',
    progress: (c) => ({ have: Math.min(c.crossings, 10), need: 10 }),
  },
];

export interface AchievementStatus extends Achievement {
  have: number;
  need: number;
  /** When it was earned, or null. */
  at: number | null;
}

export interface VisitResult {
  /** False when the article was already collected. */
  fresh: boolean;
  /** The region this visit lit for the first time, if any. */
  lit: string | null;
  unlocked: Achievement[];
}

const KEY = 'astris:sky:v1';
/** Past this many stars the collection stops growing, to keep the saved list small. */
export const COLLECT_CAP = 5000;

function browserStore(): CollectionStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The tier index (0 = unlit) for a number of collected stars. */
export function tierFor(count: number): number {
  let t = 0;
  for (const [i, tier] of TIERS.entries()) if (count >= tier.min) t = i + 1;
  return t;
}

/** The sky map: every article the reader has travelled to, saved on this device. */
export class Collection {
  private readonly list: Collected[] = [];
  private readonly known = new Set<string>();
  private readonly earned = new Map<string, number>();
  private last: string | null = null;
  private cross = 0;

  constructor(
    private readonly store: CollectionStore | null = browserStore(),
    private readonly now: () => number = Date.now,
  ) {
    this.load();
  }

  get stars(): readonly Collected[] {
    return this.list;
  }
  get count(): number {
    return this.list.length;
  }
  get crossings(): number {
    return this.cross;
  }
  /** Regions with at least one star. */
  get regionsLit(): number {
    return SUBJECTS.filter((s) => this.countIn(s) > 0).length;
  }

  countIn(subject: string): number {
    let n = 0;
    for (const s of this.list) if (s.subject === subject) n++;
    return n;
  }

  /** 0 for an unlit region, up to TIERS.length for a mastered one. */
  tierOf(subject: string): number {
    return tierFor(this.countIn(subject));
  }

  /** Every achievement with the reader's progress and the date it was earned. */
  status(): AchievementStatus[] {
    return ACHIEVEMENTS.map((a) => ({ ...a, ...a.progress(this), at: this.earned.get(a.id) ?? null }));
  }

  /** Collect the article the map has travelled to. */
  visit(title: string, subject: string): VisitResult {
    const prev = this.last;
    this.last = subject;
    if (prev !== null && prev !== subject) this.cross++;
    const fresh = !this.known.has(title) && this.list.length < COLLECT_CAP;
    const before = this.countIn(subject);
    if (fresh) {
      this.known.add(title);
      this.list.push({ title, subject, at: this.now() });
    }
    const unlocked: Achievement[] = [];
    for (const a of this.status()) {
      if (a.at === null && a.have >= a.need) {
        this.earned.set(a.id, this.now());
        unlocked.push(a);
      }
    }
    this.save();
    const litNow = fresh && before === 0 && SUBJECTS.includes(subject);
    return { fresh, lit: litNow ? subject : null, unlocked };
  }

  /** Forget everything, here and in storage. */
  reset(): void {
    this.list.length = 0;
    this.known.clear();
    this.earned.clear();
    this.last = null;
    this.cross = 0;
    this.save();
  }

  private load(): void {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return;
      const d: unknown = JSON.parse(raw);
      if (typeof d !== 'object' || d === null) return;
      const { s, e, l, x } = d as { s?: unknown; e?: unknown; l?: unknown; x?: unknown };
      if (Array.isArray(s)) {
        for (const row of s) {
          if (!Array.isArray(row)) continue;
          const [title, subject, at] = row as unknown[];
          if (typeof title !== 'string' || typeof subject !== 'string' || typeof at !== 'number' || this.known.has(title)) continue;
          this.known.add(title);
          this.list.push({ title, subject, at });
        }
      }
      if (typeof e === 'object' && e !== null) for (const [id, at] of Object.entries(e)) if (typeof at === 'number') this.earned.set(id, at);
      if (typeof l === 'string') this.last = l;
      if (typeof x === 'number' && Number.isFinite(x)) this.cross = Math.max(0, Math.floor(x));
    } catch {
      // a damaged entry starts the sky again
    }
  }

  private save(): void {
    if (!this.store) return;
    try {
      this.store.setItem(KEY, JSON.stringify({ s: this.list.map((c) => [c.title, c.subject, c.at]), e: Object.fromEntries(this.earned), l: this.last, x: this.cross }));
    } catch {
      // storage full or blocked: the sky still works for this visit
    }
  }
}

/** Where a star sits on the atlas, in a unit disc: twelve wedges, one per subject; anything else lives on the outer rim. */
export function place(title: string, subject: string): { x: number; y: number } {
  const u = hash(title) / 4294967296;
  const v = hash(title + '#r') / 4294967296;
  const i = SUBJECTS.indexOf(subject);
  if (i < 0) {
    const a = u * Math.PI * 2;
    const r = 0.96 + v * 0.06;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }
  const wedge = (Math.PI * 2) / SUBJECTS.length;
  const a = -Math.PI / 2 + (i + 0.5) * wedge + (u - 0.5) * wedge * 0.8;
  const r = 0.14 + Math.sqrt(v) * 0.78;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
