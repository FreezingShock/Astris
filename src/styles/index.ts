/**
 * Reads design tokens from tokens.css so that no colour is written anywhere else.
 * The canvas cannot use CSS variables directly, so the engine asks for them here.
 */
import type { SubjectId } from '../types';
import { esc } from '../lib';

/** The twelve subject colour families, in the order the keys are drawn. */
export const SUBJECTS: readonly SubjectId[] = [
  'Architecture',
  'Urban planning',
  'Civil engineering',
  'Sustainable design',
  'Astronomy',
  'Music',
  'Biology',
  'Philosophy',
  'Computer science',
  'History',
  'Geography',
  'Video game',
];

const cache = new Map<string, string>();

/** The computed value of a CSS custom property on the root element. */
export function token(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value) cache.set(name, value);
  return value;
}

function slug(subject: SubjectId): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** True when the subject is one of the twelve colour families. */
export function isSubject(subject: SubjectId): boolean {
  return SUBJECTS.includes(subject);
}

/** "r, g, b" for a subject. A subject outside the twelve families gets neutral starlight. */
export function subjectRgb(subject: SubjectId): string {
  return (isSubject(subject) && token('--subject-' + slug(subject))) || token('--starlight-rgb');
}

/** A small glowing dot in the subject's colour, as HTML. */
export function swatch(subject: SubjectId, px = 9): string {
  return "<i class='dot' style='--c:rgb(" + subjectRgb(subject) + ');display:inline-block;vertical-align:middle;width:' + px + 'px;height:' + px + "px'></i>";
}

/** The key of all twelve subjects, shown on the main page. */
export function subjectKeyHtml(): string {
  return SUBJECTS.map((c) => {
    const rgb = subjectRgb(c);
    return (
      "<span style='white-space:nowrap'><i class='dot' style='--c:rgb(" +
      rgb +
      ');display:inline-block;vertical-align:middle;width:9px;height:9px;box-shadow:0 0 0 4px var(--night),0 0 7px 4px rgb(' +
      rgb +
      ")'></i>&nbsp;&nbsp;" +
      esc(c) +
      '</span>'
    );
  }).join(' &nbsp; ');
}

/** One dot per subject, shown on the design system page. */
export function subjectDotsHtml(): string {
  return SUBJECTS.map((c) => "<span class='dot' title='" + esc(c) + "' style='--c:rgb(" + subjectRgb(c) + ")'></span>").join('');
}

/** True when the reader asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resolves once tokens.css has been applied, so token() returns real values. */
export function stylesReady(): Promise<void> {
  return new Promise((resolve) => {
    const check = (): void => {
      if (getComputedStyle(document.documentElement).getPropertyValue('--night').trim()) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

export { replay, scrollBehavior, jumpTo } from './motion';
