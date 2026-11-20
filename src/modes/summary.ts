import type { ArticleSummary } from '../types';
import { esc } from '../lib';

const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

/** The address when it is a plain https link, or an empty string. Keeps scripts out of href and src. */
export function safeUrl(url: string | undefined): string {
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
}

/**
 * The article's own words in the panel: thumbnail, opening extract, a link to the full article and its licence.
 * The thumbnail links to the article too, which is where a reader finds the image's credit.
 */
export function summaryHtml(title: string, summary: ArticleSummary | null): string {
  if (!summary) return "<p class='wait'>Fetching the article…</p>";
  const url = safeUrl(summary.url);
  const thumb = safeUrl(summary.thumbnail);
  const text = summary.extract.trim();
  const open = url ? "<a href='" + esc(url) + "' target='_blank' rel='noopener'" : '';
  let html = '';
  if (thumb && url) html += open + " class='thumb' aria-label=\"" + esc(title) + ' on Wikipedia"><img src=\'' + esc(thumb) + "' alt='' loading='lazy'></a>";
  if (text) html += '<p>' + (text.startsWith(title) ? '<b>' + esc(title) + '</b>' + esc(text.slice(title.length)) : esc(text)) + '</p>';
  else html += "<p class='wait'>This article has no summary.</p>";
  if (url)
    html +=
      "<p class='src'>" +
      open +
      '>Read the full article on Wikipedia</a>' +
      (text ? " · Text from Wikipedia, under <a href='" + LICENCE_URL + "' target='_blank' rel='noopener license'>CC BY-SA 4.0</a>" : '') +
      '</p>';
  return html;
}
