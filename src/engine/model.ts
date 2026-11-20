import type { Star, SubjectId } from '../types';

/** A star with everything the layout and the renderer add to it. */
export interface StarNode extends Star {
  /** Distance from the centre and offset from it, in map units. */
  r: number;
  dx: number;
  dy: number;
  /** Twinkle phase and speed. */
  ph: number;
  sp: number;
  /** When the star appears. */
  born: number;
  /** The star this one hangs from, or null for the centre. */
  par: StarNode | null;
  bend: number;
  /** Set by the renderer each frame: how grown the star is, whether it is on screen, and where. */
  a: number;
  on: boolean;
  sx: number;
  sy: number;
  /** Dissolve: delay and direction, set when the constellation becomes a memory. */
  gd: number;
  gux: number;
  guy: number;
  /** True when the star was already on the map. It sits where the first one is and only adds a thread. */
  dup?: boolean;
  /** Set while the star is being cleared: when, which way it drifts, how far it had already sunk, and whether it is going for good. */
  out?: { t0: number; ux: number; uy: number; k0: number; hard: boolean };
  /** Cached label widths. */
  wb?: number;
  ws?: number;
}

export interface ThreadGroup {
  subject: SubjectId;
  rank: number;
  nodes: StarNode[];
}

export interface Pulse {
  n: StarNode | null;
  t0: number;
}

export interface MemoryMove {
  t0: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  s0: number;
  s1: number;
}

/** One constellation on the map: the live one, or a memory of one already left. */
export interface Con {
  title: string;
  subject: SubjectId;
  x: number;
  y: number;
  sc: number;
  born: number;
  nodes: StarNode[];
  groups: ThreadGroup[];
  /** Subjects present, the centre's own first, then by size. */
  topics: SubjectId[];
  /** Stars per subject. */
  counts: Record<SubjectId, number>;
  dim: number;
  dimT: number;
  pulses: Pulse[];
  /** Set when the constellation becomes a memory: when, and the star the reader left through, if any. */
  ghost: { t0: number; via: StarNode | null } | null;
  gm: MemoryMove | null;
  gone: boolean;
  /** Largest distance of any star from the centre, in unscaled units. Cleared when stars are dropped. */
  reach?: number;
  /** Set when a stand-in became the real constellation: the centre does not regrow, it swells. */
  arrivedAt?: number;
  /** True for a stand-in centre while its constellation loads: it draws the centre star and nothing else. */
  pending?: boolean;
  /** Whether any of it was on screen in the last frame. */
  vis?: boolean;
  /** Screen position of the centre and number of stars drawn, set by the renderer. */
  cx: number;
  cy: number;
  count: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Point {
  x: number;
  y: number;
}

/** What the pointer is over: a star of the live constellation, or a memory. */
export type PickTarget = { kind: 'star'; node: StarNode } | { kind: 'memory'; con: Con };
