import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './site/site.css';
import './modes/play.css';
import './styles/surfaces.css';
import './styles/responsive.css';
import './styles/motion.css';

import { SampleProvider, WikipediaProvider } from './data';
import { Play, type SourceCopy } from './modes';
import { Site } from './site';
import { stylesReady } from './styles';
import { initTilt } from './styles/tilt';
import type { DataProvider } from './types';

/**
 * The one place that chooses where data comes from.
 * The site runs on live Wikipedia. Building with VITE_DATA=sample swaps in the built-in sample set,
 * which is what the Playwright smoke tests do so that they never depend on the network.
 */
const live = import.meta.env.VITE_DATA === 'sample' ? null : new WikipediaProvider();
const sample = new SampleProvider();
// A sample build with ?latency=800 waits that many milliseconds before each constellation, to try the map on a slow network.
const wait = Number(new URLSearchParams(location.search).get('latency')) || 0;
const slow: DataProvider = {
  suggest: (q) => sample.suggest(q),
  constellation: (t) => (wait ? new Promise((r) => setTimeout(r, wait)).then(() => sample.constellation(t)) : sample.constellation(t)),
  summary: (t) => sample.summary(t),
  random: () => sample.random(),
  neighbours: (t) => sample.neighbours(t),
};
const provider: DataProvider = live ?? slow;
const copy: SourceCopy = live
  ? {
      status: 'live from Wikipedia',
      missing: 'on Wikipedia',
      panelNote: 'From Wikipedia, the free encyclopedia. Text is available under CC BY-SA 4.0.',
    }
  : {
      status: 'sample data',
      missing: 'in the sample set',
      panelNote: 'Sample entry. The finished site shows the Wikipedia article here.',
    };

initTilt();
void stylesReady().then(() => {
  // Play asks the site whether the map is open, and the site is built after Play.
  const state: { site: Site | null } = { site: null };
  const play = new Play(provider, copy, () => state.site?.onMap ?? false);
  // When Wikipedia asks for a pause, say so quietly instead of looking stuck.
  if (live) live.onThrottle = (waitMs) => play.toast('Slowing down for Wikipedia. Back in ' + Math.ceil(waitMs / 1000) + ' seconds.');
  const site = new Site(provider, play);
  state.site = site;
  site.start();
});
