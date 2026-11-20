import type { Constellation, SubjectId } from '../types';
import { hash } from '../lib';
import { CONFIG } from './config';
import type { Con, StarNode, ThreadGroup } from './model';

/**
 * Lay out a constellation: stars grouped into one wedge per subject,
 * ranked outward in five bands, with a slight spiral.
 * Pure: no DOM, so it runs in unit tests.
 */
export function makeCon(data: Constellation, x: number, y: number, now: number, delay: number): Con {
  const centre = data.center;
  const by = new Map<SubjectId, { count: number; ranks: StarNode[][] }>();
  const order: SubjectId[] = [];
  const nodes: StarNode[] = [];
  const groups = new Map<string, ThreadGroup>();

  for (const star of data.stars) {
    let entry = by.get(star.subject);
    if (!entry) {
      entry = { count: 0, ranks: [[], [], [], [], [], []] };
      by.set(star.subject, entry);
      order.push(star.subject);
    }
    const node: StarNode = { ...star, r: 0, dx: 0, dy: 0, ph: 0, sp: 0, born: 0, par: null, bend: 0, a: 0, on: false, sx: 0, sy: 0, gd: 0, gux: 0, guy: 0 };
    entry.ranks[star.rank]?.push(node);
    entry.count++;
  }
  const countOf = (c: SubjectId): number => by.get(c)?.count ?? 0;
  order.sort((a, b) => Number(b === centre.subject) - Number(a === centre.subject) || countOf(b) - countOf(a));

  let a0 = (hash(centre.title) % 628) / 100;
  const total = data.stars.length;
  for (const c of order) {
    const entry = by.get(c);
    if (!entry) continue;
    const span = (Math.PI * 2 * entry.count) / total;
    for (let L = 1; L <= 5; L++) {
      const arr = entry.ranks[L] ?? [];
      const band = CONFIG.band[L] ?? [0, 0];
      const b0 = band[0] ?? 0;
      const b1 = band[1] ?? 0;
      arr.forEach((o, j) => {
        const r = Math.sqrt(b0 * b0 + ((j + 0.5) / arr.length) * (b1 * b1 - b0 * b0));
        const a = a0 + span * (0.06 + 0.88 * ((j * 0.618034 + L * 0.37) % 1)) + r * CONFIG.spiral;
        const h = hash(o.title);
        o.r = r;
        o.dx = Math.cos(a) * r;
        o.dy = Math.sin(a) * r;
        o.ph = (h % 628) / 100;
        o.sp = 0.6 + (h % 90) / 100;
        o.born = now + delay + CONFIG.bloomLeadMs + (r / CONFIG.rMax) * CONFIG.bloomSpreadMs + (h % 110);
        nodes.push(o);
        const key = c + '|' + L;
        let group = groups.get(key);
        if (!group) {
          group = { subject: c, rank: L, nodes: [] };
          groups.set(key, group);
        }
        group.nodes.push(o);
      });
    }
    a0 += span;
  }

  nodes.sort((p, q) => p.r - q.r);
  // each star hangs from the nearest star closer to the centre
  const maxSq = CONFIG.maxThread * CONFIG.maxThread;
  nodes.forEach((o, i) => {
    let best: StarNode | null = null;
    let bd = 1e9;
    for (let j = 0; j < i; j++) {
      const p = nodes[j];
      if (!p) continue;
      const d = (p.dx - o.dx) * (p.dx - o.dx) + (p.dy - o.dy) * (p.dy - o.dy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    o.par = o.r < CONFIG.centreThreadRadius || !best || bd > maxSq ? null : best;
    o.bend = (hash(o.title) % 2 ? 1 : -1) * CONFIG.threadBend;
  });

  const counts: Record<SubjectId, number> = {};
  for (const c of order) counts[c] = countOf(c);

  return {
    title: centre.title,
    subject: centre.subject,
    x,
    y,
    sc: 1,
    born: now + delay,
    nodes,
    groups: [...groups.values()],
    topics: order,
    counts,
    dim: 1,
    dimT: 1,
    pulses: [],
    ghost: null,
    gm: null,
    gone: false,
    cx: 0,
    cy: 0,
    count: 0,
  };
}
