import { clock, esc } from '../lib';
import { dayLabel, dayOf, starsText, streakOn, type RunRecord, type Stats } from '../modes';

const tile = (label: string, value: string, note = ''): string =>
  "<div class='tile'><div class='v'>" + esc(value) + "</div><div class='k'>" + esc(label) + '</div>' + (note ? "<div class='n'>" + esc(note) + '</div>' : '') + '</div>';

const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many);

function runRow(r: RunRecord): string {
  const par = r.par === null || r.par < 0 ? 'par unknown' : 'par ' + r.par;
  return (
    '<tr><td>' +
    esc(dayLabel(r.day)) +
    (r.mode === 'daily' ? " <span class='tag live'>daily</span>" : '') +
    '</td><td>' +
    esc(r.start) +
    ' → ' +
    esc(r.target) +
    "</td><td class='stars'>" +
    esc(starsText(r.stars) || '–') +
    "</td><td class='num'>" +
    r.points +
    "</td><td class='num'>" +
    plural(r.clicks, 'click', 'clicks') +
    ', ' +
    esc(par) +
    ', ' +
    clock(r.time) +
    '</td></tr>'
  );
}

/** The stats page body. Everything that came from storage goes through esc(). */
export function statsHtml(stats: Stats, today: number = dayOf()): string {
  if (!stats.runs)
    return "<div class='box c'><h2>No runs yet</h2><div class='in'><p>Finish a race and your score, stars and streak show up here.</p><p><button class='btn go' type='button' data-race='1'>Start today's race</button></p></div></div>";
  const streak = streakOn(stats, today);
  const tiles =
    tile('Current streak', plural(streak, 'day', 'days'), streak ? 'Race again today to keep it' : 'Finish a race to start one') +
    tile('Longest streak', plural(stats.longest, 'day', 'days')) +
    tile('Stars earned', String(stats.stars), plural(stats.threeStar, 'three-star run', 'three-star runs')) +
    tile('Total points', stats.points.toLocaleString('en'), plural(stats.runs, 'run', 'runs'));
  const bests =
    '<li>Best score <b>' +
    stats.bestPoints +
    '</b></li><li>Fewest clicks <b>' +
    (stats.fewestClicks ?? '–') +
    '</b></li><li>Fastest finish <b>' +
    (stats.fastest === null ? '–' : clock(stats.fastest)) +
    '</b></li>';
  return (
    "<div class='tiles'>" +
    tiles +
    "</div><div class='cols'><div><div class='box a'><h2>Personal bests</h2><div class='in'><ul class='bests'>" +
    bests +
    "</ul></div></div></div><div><div class='box b'><h2>How scoring works</h2><div class='in'><ul>" +
    '<li>Up to 600 for steps: full marks at par, less for each click over, and 100 extra for each click under.</li>' +
    '<li>Up to 300 for speed, against 30 seconds a step of par plus 30.</li>' +
    '<li>Each Reveal costs 100.</li>' +
    '<li>Three stars: par or better with no hints. Two: one over par and at most one hint. Otherwise one.</li>' +
    "</ul></div></div></div></div><div class='box c recent'><h2>Recent runs</h2><div class='in'><div class='scroll'><table><thead><tr><th>Day</th><th>Race</th><th>Stars</th><th>Points</th><th>Result</th></tr></thead><tbody>" +
    stats.recent.map(runRow).join('') +
    "</tbody></table></div><p><button class='btn' type='button' id='statsReset'>Clear my stats</button></p></div></div>"
  );
}
