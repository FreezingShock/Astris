/**
 * SampleProvider: the mockup's built-in data behind the shared contract.
 * Used in tests, offline, and until WikipediaProvider is ready.
 * Twelve subjects with about ten real article titles each, padded with generated titles.
 */
import type { ArticleSummary, Constellation, DataProvider, Star, SubjectId, Suggestion } from '../types';
import { hash } from '../lib';
import { MAX_STARS, rankOf } from './rank';

const CL: Record<string, string[]> = {
  Architecture: [
    'Brutalist architecture',
    'Bauhaus',
    'Gothic architecture',
    'Modern architecture',
    'Art Deco',
    'Frank Lloyd Wright',
    'Le Corbusier',
    'Zaha Hadid',
    'Skyscraper',
    'Vernacular architecture',
    'Arch bridge',
  ],
  'Urban planning': [
    'New Urbanism',
    'Garden city movement',
    'Zoning',
    'Transit-oriented development',
    'Jane Jacobs',
    'Urban sprawl',
    'Walkability',
    'Greenbelt',
    'Smart growth',
    'Public space',
  ],
  'Civil engineering': [
    'Bridge',
    'Dam',
    'Reinforced concrete',
    'Structural engineering',
    'Geotechnical engineering',
    'Tunnel',
    'Surveying',
    'Aqueduct',
    'Suspension bridge',
    'Retaining wall',
  ],
  'Sustainable design': [
    'Green roof',
    'Passive house',
    'Solar panel',
    'Rainwater harvesting',
    'Adaptive reuse',
    'Urban heat island',
    'Permeable paving',
    'Biophilic design',
    'Zero-energy building',
    'Daylighting',
  ],
  Astronomy: ['Black hole', 'Neutron star', 'Galaxy', 'Milky Way', 'Supernova', 'Exoplanet', 'Nebula', 'Dark matter', 'Big Bang', 'Solar System'],
  Music: ['Jazz', 'Blues', 'Synthesizer', 'Hip hop', 'Punk rock', 'Guitar', 'Drum machine', 'Shoegaze', 'Ambient music', 'Vinyl record'],
  Biology: ['Cell (biology)', 'DNA', 'Evolution', 'Photosynthesis', 'Mitochondrion', 'Ecosystem', 'Natural selection', 'Protein', 'Enzyme', 'Neuron'],
  Philosophy: ['Stoicism', 'Existentialism', 'Epistemology', 'Ethics', 'Plato', 'Aristotle', 'Nihilism', 'Utilitarianism', 'Metaphysics', 'Logic'],
  'Computer science': ['Algorithm', 'Search engine', 'Trie', 'Hash table', 'Web crawler', 'Inverted index', 'Graph theory', 'PageRank', 'Autocomplete', 'Database'],
  History: [
    'Roman Empire',
    'Renaissance',
    'Industrial Revolution',
    'Silk Road',
    'Ancient Egypt',
    'Byzantine Empire',
    'Cold War',
    'Printing press',
    'Bronze Age',
    'Library of Alexandria',
  ],
  Geography: ['Pacific Ocean', 'Sierra Nevada', 'Mojave Desert', 'Amazon rainforest', 'Sahara', 'Himalayas', 'Nile', 'Tokyo', 'Paris', 'Antarctica'],
  'Video game': [
    'City-building game',
    'Procedural generation',
    'Pixel art',
    'Game engine',
    'Roguelike',
    'Level design',
    'Sandbox game',
    'Arcade game',
    'Text-based game',
    'ASCII art',
  ],
};

const NB0: Record<string, string[]> = {
  Architecture: ['Urban planning', 'Civil engineering', 'Sustainable design', 'History'],
  'Urban planning': ['Architecture', 'Sustainable design', 'Geography', 'Civil engineering'],
  'Civil engineering': ['Architecture', 'Urban planning', 'Sustainable design'],
  'Sustainable design': ['Architecture', 'Urban planning', 'Biology'],
  Astronomy: ['Philosophy', 'Computer science', 'History'],
  Music: ['History', 'Computer science', 'Video game'],
  Biology: ['Sustainable design', 'Philosophy', 'Astronomy'],
  Philosophy: ['History', 'Biology', 'Computer science'],
  'Computer science': ['Video game', 'Philosophy', 'Music'],
  History: ['Architecture', 'Philosophy', 'Geography'],
  Geography: ['History', 'Urban planning', 'Biology'],
  'Video game': ['Computer science', 'Music', 'Urban planning'],
};

const PROPER = new Set(
  'Bauhaus,Art Deco,Frank Lloyd Wright,Le Corbusier,Zaha Hadid,Jane Jacobs,New Urbanism,Milky Way,Big Bang,Solar System,DNA,Plato,Aristotle,PageRank,Roman Empire,Renaissance,Industrial Revolution,Silk Road,Ancient Egypt,Byzantine Empire,Cold War,Bronze Age,Library of Alexandria,Pacific Ocean,Sierra Nevada,Mojave Desert,Amazon rainforest,Sahara,Himalayas,Nile,Tokyo,Paris,Antarctica,ASCII art,Gothic architecture,Brutalist architecture'.split(
    ',',
  ),
);
const PLACES = 'Japan,France,Brazil,Egypt,India,Mexico,Italy,Germany,China,Canada,Spain,Kenya,Peru,Norway,Turkey,Greece'.split(',');

/** Subject neighbours, made symmetric. */
const NB: Record<string, string[]> = {};
for (const c of Object.keys(CL)) NB[c] = (NB0[c] ?? []).slice();
for (const c of Object.keys(NB0)) for (const d of NB0[c] ?? []) if (!NB[d]?.includes(c)) NB[d]?.push(c);

const titles: string[] = [];
const clusterOf = new Map<string, SubjectId>();
for (const c of Object.keys(CL)) {
  titles.push(c);
  clusterOf.set(c, c);
  for (const t of CL[c] ?? []) {
    titles.push(t);
    clusterOf.set(t, c);
  }
}
titles.sort((a, b) => a.localeCompare(b));

function plain(t: string): string {
  return t.replace(/\s*\(.*\)$/, '');
}
function low(t: string): string {
  const p = plain(t);
  return PROPER.has(p) ? p : p.charAt(0).toLowerCase() + p.slice(1);
}

/** What one click reaches on the sample graph. */
function reach(t: string, c: SubjectId): string[] {
  const own = CL[c] ?? [];
  return t === c ? own.concat(NB[c] ?? []) : [c].concat(own.filter((x) => x !== t));
}

type Kind = 'own' | 'name' | 'gen';

export class SampleProvider implements DataProvider {
  /** Subjects of generated titles this provider has handed out, so they can be travelled to. */
  private readonly generated = new Map<string, SubjectId>();

  /** Every real title in the sample set, sorted. */
  static readonly titles: readonly string[] = titles;

  /** True when the title is one of the real sample articles, not a generated one. */
  static isReal(title: string): boolean {
    return clusterOf.has(title);
  }

  private subjectOf(title: string): SubjectId | undefined {
    return clusterOf.get(title) ?? this.generated.get(title);
  }

  suggest(query: string): Promise<Suggestion[]> {
    const q = query.trim().toLowerCase();
    if (!q) return Promise.resolve([]);
    const a: string[] = [];
    const b: string[] = [];
    const c: string[] = [];
    for (const t of titles) {
      const l = t.toLowerCase();
      if (l.startsWith(q)) a.push(t);
      else if (l.split(/[\s(-]+/).some((w) => w.startsWith(q))) b.push(t);
      else if (l.includes(q)) c.push(t);
    }
    const found = a.length + b.length ? a.concat(b) : c;
    return Promise.resolve(
      found.slice(0, 7).map((t) => {
        const subject = clusterOf.get(t) ?? '';
        return { title: t, description: t === subject ? 'subject' : subject };
      }),
    );
  }

  constellation(title: string): Promise<Constellation> {
    const subject = this.subjectOf(title);
    if (subject === undefined) return Promise.reject(new Error('No article called "' + title + '" in the sample set.'));
    return Promise.resolve({ center: { title, subject }, stars: this.stars(title, subject, MAX_STARS) });
  }

  summary(title: string): Promise<ArticleSummary> {
    const real = SampleProvider.isReal(title);
    return Promise.resolve({
      title,
      extract:
        title +
        ' is the article at the centre of this constellation' +
        (real ? '' : ', a generated title used to fill out the sample map') +
        '. Stars nearer the centre are tied to it in more ways. Each colour is a subject.',
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')),
    });
  }

  random(): Promise<string> {
    return Promise.resolve(titles[Math.floor(Math.random() * titles.length)] ?? 'Architecture');
  }

  neighbours(title: string): Promise<string[]> {
    const subject = this.subjectOf(title);
    return Promise.resolve(subject === undefined ? [] : reach(title, subject));
  }

  /** Every article near a centre, with its three relations and one rank from 1 to 5. */
  private stars(centre: string, subject: SubjectId, limit: number): Star[] {
    const seen = new Set<string>([centre]);
    const out: Star[] = [];
    const w = (plain(centre).split(' ')[0] ?? '').toLowerCase();
    const put = (t: string, c: SubjectId, kind: Kind, real: boolean): void => {
      if (seen.has(t)) return;
      seen.add(t);
      const h = hash(centre + '|' + t);
      const a = h % 100;
      const b = (h >>> 8) % 100;
      let linksOut: boolean;
      let linksIn: boolean;
      let nameMatch = false;
      if (kind === 'name') {
        nameMatch = true;
        linksOut = a < 36;
        linksIn = b < 30;
      } else if (kind === 'own') {
        linksOut = true;
        linksIn = b < 74;
      } else {
        linksOut = a < 60;
        linksIn = b < 32;
        if (!linksOut && !linksIn) linksOut = true;
      }
      if (!nameMatch && w.length > 3 && t.toLowerCase().includes(w)) nameMatch = true;
      const rank = rankOf(linksOut, linksIn, nameMatch);
      const score = (6 - rank) * 10 + (real ? 5 : 0) + (h % 1000) / 170;
      if (!real) this.generated.set(t, c);
      out.push({ title: t, subject: c, linksOut, linksIn, nameMatch, rank, score });
    };

    for (const t of reach(centre, subject)) put(t, clusterOf.get(t) ?? subject, 'own', true);

    const b = plain(centre);
    const l = low(centre);
    const names = SampleProvider.isReal(centre)
      ? [
          'History of ' + l,
          'Outline of ' + l,
          b + ' (disambiguation)',
          'Timeline of ' + l,
          'Glossary of ' + l,
          b + ' theory',
          'Philosophy of ' + l,
          b + ' in the 20th century',
        ].concat(PLACES.slice(0, 9).map((p) => b + ' in ' + p))
      : [b + ' (disambiguation)'];
    for (const t of names) put(t, subject, 'name', false);

    const gen: [string, SubjectId][] = [];
    for (const c of [subject].concat(NB[subject] ?? [])) {
      for (const x of [c].concat(CL[c] ?? [])) {
        if (x === centre) continue;
        gen.push(['History of ' + low(x), c]);
        if (!PROPER.has(plain(x))) for (const p of PLACES) gen.push([plain(x) + ' in ' + p, c]);
      }
    }
    gen.sort((p, q) => hash(centre + p[0]) - hash(centre + q[0]));
    for (let i = 0; i < gen.length && out.length < limit; i++) {
      const g = gen[i];
      if (g) put(g[0], g[1], 'gen', false);
    }
    return out.sort((p, q) => p.rank - q.rank || q.score - p.score);
  }
}
