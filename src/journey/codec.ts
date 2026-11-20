import { hash } from '../lib';
import type { Constellation, Rank, Star } from '../types';

/** Bump when the shape of a token or a saved record changes, and teach `migrate` the old one. */
export const FORMAT = 1;
/** A journey keeps its latest steps; older ones fall off the front. */
export const MAX_STEPS = 120;
export const MAX_TITLE = 255;
/** Longest token a link may carry. Longer ones are refused, not trimmed. */
export const MAX_TOKEN = 4000;

const ID_RE = /^[a-z0-9]{6,16}$/;

export function validId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** A short random id for one tab's journey. */
export function newId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += (b % 36).toString(36) + ((b >> 3) % 36).toString(36);
  return out.slice(0, 10);
}

/** A title that is safe to trust: a non-empty string of sensible length without control characters. */
export function cleanTitle(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = t.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s && s.length <= MAX_TITLE ? s : null;
}

/* ---------- the share token ---------- */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const check = (body: string): string => hash(body).toString(36).slice(-4).padStart(4, '0');

/**
 * The compact token for an ordered path of centres: "1.<body>.<check>".
 * Each title is written once and the path refers to it by number, so going back and forth costs almost nothing.
 */
export function encodePath(path: readonly string[]): string {
  const titles: string[] = [];
  const at = new Map<string, number>();
  const steps: string[] = [];
  for (const raw of path.slice(-MAX_STEPS)) {
    const t = cleanTitle(raw);
    if (!t) continue;
    let i = at.get(t);
    if (i === undefined) {
      i = titles.length;
      titles.push(t);
      at.set(t, i);
    }
    steps.push(i.toString(36));
  }
  const body = toBase64Url(titles.join('\n') + '\u0001' + steps.join(','));
  return FORMAT + '.' + body + '.' + check(body);
}

/** Read a token back. Returns null for anything damaged, foreign, from a newer format, or too large. */
export function decodePath(token: string): string[] | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== String(FORMAT)) return null;
  const [, body, sum] = parts as [string, string, string];
  if (check(body) !== sum) return null;
  const text = fromBase64Url(body);
  if (!text) return null;
  const [list, order, ...rest] = text.split('\u0001');
  if (list === undefined || !order || rest.length) return null;
  const titles = list.split('\n');
  const path: string[] = [];
  for (const s of order.split(',')) {
    if (!/^[0-9a-z]{1,4}$/.test(s)) return null;
    const t = cleanTitle(titles[parseInt(s, 36)]);
    if (!t) return null;
    path.push(t);
  }
  return path.length && path.length <= MAX_STEPS ? path : null;
}

/* ---------- saved constellations ---------- */

/** One constellation in the smallest form that still rebuilds it: [centre, subject, [[title, subject, flags, rank, score]]]. */
export type PackedCon = [string, string, [string, string, number, number, number][]];

export function pack(data: Constellation): PackedCon {
  return [
    data.center.title,
    data.center.subject,
    data.stars.map((s) => [s.title, s.subject, (s.linksOut ? 1 : 0) | (s.linksIn ? 2 : 0) | (s.nameMatch ? 4 : 0), s.rank, Math.round(s.score * 1000) / 1000]),
  ];
}

/** Rebuild a constellation, or null when what was saved does not have the right shape. */
export function unpack(p: unknown): Constellation | null {
  if (!Array.isArray(p) || p.length !== 3 || typeof p[0] !== 'string' || typeof p[1] !== 'string' || !Array.isArray(p[2])) return null;
  const stars: Star[] = [];
  for (const s of p[2] as unknown[]) {
    if (!Array.isArray(s) || s.length !== 5) return null;
    const [title, subject, flags, rank, score] = s as unknown[];
    if (typeof title !== 'string' || typeof subject !== 'string' || typeof flags !== 'number' || typeof score !== 'number') return null;
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 5) return null;
    stars.push({ title, subject, linksOut: !!(flags & 1), linksIn: !!(flags & 2), nameMatch: !!(flags & 4), rank: rank as Rank, score });
  }
  return { center: { title: p[0], subject: p[1] }, stars };
}
