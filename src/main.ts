import './styles/tokens.css';
import './styles/base.css';
import './site/site.css';
import './modes/play.css';
import './styles/responsive.css';

import { SampleProvider } from './data';
import { Play, type SourceCopy } from './modes';
import { Site } from './site';
import { stylesReady } from './styles';
import type { DataProvider } from './types';

/**
 * The one place that chooses where data comes from.
 * Swap SampleProvider for WikipediaProvider here, and update the wording with it.
 */
const provider: DataProvider = new SampleProvider();
const copy: SourceCopy = {
  status: 'sample data',
  missing: 'in the sample set',
  panelNote: 'Sample entry. The finished site shows the Wikipedia article here.',
};

void stylesReady().then(() => {
  // Play asks the site whether the map is open, and the site is built after Play.
  const state: { site: Site | null } = { site: null };
  const play = new Play(provider, copy, () => state.site?.onMap ?? false);
  const site = new Site(provider, play);
  state.site = site;
  site.start();
});
