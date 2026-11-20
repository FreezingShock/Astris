import type { ArticleSummary } from '../types';
import { esc } from '../lib';
import { swatch } from '../styles';
import { relations } from '../comforts';
import type { Con } from '../engine';
import { summaryHtml } from './summary';

/** The article panel: the live constellation, in encyclopedia dress. */
export function panelHtml(cur: Con, trail: readonly string[], visited: ReadonlySet<string>, summary: ArticleSummary | null, note: string): string {
  const cnt = [0, 0, 0, 0, 0, 0];
  for (const n of cur.nodes) cnt[n.rank] = (cnt[n.rank] ?? 0) + 1;
  const top = cur.nodes
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 9);
  const link = (title: string): string =>
    '<button type="button" class="lk" data-t="' + esc(title) + '"' + (visited.has(title) ? ' style="color:var(--visited)"' : '') + '>' + esc(title) + '</button>';
  return (
    '<h1>' +
    esc(cur.title) +
    "</h1><div class='sub'>" +
    esc(note) +
    '</div>' +
    "<div class='ib'><b>Subject</b><span>" +
    swatch(cur.subject) +
    ' ' +
    esc(cur.subject) +
    "</span><b>Stars</b><span class='mono'>" +
    cur.nodes.length +
    "</span><b>Rank 1 to 2</b><span class='mono'>" +
    ((cnt[1] ?? 0) + (cnt[2] ?? 0)) +
    " close ties</span><b>Rank 3 to 5</b><span class='mono'>" +
    ((cnt[3] ?? 0) + (cnt[4] ?? 0) + (cnt[5] ?? 0)) +
    ' loose ties</span></div>' +
    "<div class='sum'>" +
    summaryHtml(cur.title, summary) +
    '</div>' +
    '<h2>Closest stars</h2><ul>' +
    top.map((o) => '<li>' + swatch(o.subject, 8) + ' ' + link(o.title) + ' <small>' + relations(o) + '</small></li>').join('') +
    '</ul>' +
    '<h2>Your path</h2><ol>' +
    trail.map((t) => '<li>' + esc(t) + '</li>').join('') +
    '</ol>'
  );
}

/** The legend: subjects in the live constellation, and what rank looks like. */
export function legendHtml(cur: Con): string {
  return (
    '<b>Subjects here</b>' +
    cur.topics.map((c) => '<div>' + swatch(c) + '<span>' + esc(c) + " <span style='color:var(--muted)'>" + (cur.counts[c] ?? 0) + '</span></span></div>').join('') +
    "<b style='margin-top:8px'>Rank</b><div style='grid-template-columns:auto 1fr'><span style='display:flex;gap:5px;align-items:center'><i class='dot' style='--c:var(--rank-1);width:11px;height:11px'></i><i class='dot' style='--c:var(--legend-mid);width:8px;height:8px'></i><i class='dot' style='--c:var(--rank-4);width:5px;height:5px'></i></span><span>bigger, brighter, closer</span></div>"
  );
}
