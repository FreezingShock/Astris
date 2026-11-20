/**
 * The subject mapping table: which of the twelve colour families an article belongs to.
 * Version 1 matches keywords against the article's title, short description and category names.
 * An article that matches nothing gets NEUTRAL_SUBJECT, which is outside the twelve and renders as plain starlight.
 * This is the spec's known weak point. Improve it by editing the table; nothing else needs to change.
 */
import type { SubjectId } from '../types';

/** The subject of an article that fits none of the twelve families. */
export const NEUTRAL_SUBJECT: SubjectId = 'Other';

/**
 * Keywords per subject, lower case. A trailing * matches any word ending ("architect*" matches "architectural").
 * Order matters only for ties: the earlier subject wins.
 */
const TABLE: readonly (readonly [SubjectId, string])[] = [
  [
    'Video game',
    'video game*|computer game*|gaming|gameplay|game engine*|game developer*|game designer*|game console*|nintendo|playstation|xbox|arcade|roguelike*|esports|platformer*|role-playing game*|pixel art',
  ],
  [
    'Architecture',
    'architect*|building|buildings|skyscraper*|cathedral*|palace*|castle*|tower|towers|mosque*|temple*|basilica*|facade*|brutalis*|bauhaus|art deco|gothic|modernist|interior design|monument*|mansion*|housing estate*|pavilion*',
  ],
  [
    'Urban planning',
    'urban*|planning|zoning|suburb*|neighbourhood*|neighborhood*|public transport*|transit|land use|new town*|public space*|planned communit*|garden cit*|walkab*|greenbelt*|green belt*|streetscape*|gentrification|smart growth',
  ],
  [
    'Civil engineering',
    'civil engineer*|structural*|geotechnical|bridge*|dam|dams|tunnel*|viaduct*|aqueduct*|concrete|cement|masonry|asphalt|construction|infrastructure|road|roads|highway*|motorway*|railway*|railroad*|canal*|surveying|reservoir*|sewer*|sewage|pipeline*|levee*|embankment*|building material*|retaining wall*',
  ],
  [
    'Sustainable design',
    'sustainab*|renewable*|solar power|solar energy|solar panel*|solar cell*|photovoltaic*|wind power|wind farm*|wind turbine*|green building*|green roof*|energy efficien*|zero-energy|recycl*|climate change|environmental*|passive house|low-carbon|carbon footprint|emission*|pollution|waste management|rainwater|biophilic|adaptive reuse|heat island',
  ],
  [
    'Astronomy',
    'astronom*|astrophysic*|planet*|star|stars|constellation*|galax*|nebula*|comet*|asteroid*|moon*|lunar|solar system|spacecraft|spaceflight|outer space|nasa|telescope*|observator*|cosmolog*|black hole*|supernova*|exoplanet*|orbit*|universe|astronaut*|rocket*|dark matter|big bang|milky way',
  ],
  [
    'Music',
    'music*|singer*|song*|album*|band|bands|composer*|opera*|orchestra*|jazz|blues|hip hop|rapper*|guitar*|piano*|pianist*|drummer*|symphon*|record label*|concert*|choir*|synthesizer*|disc jockey*|discography|punk rock|vinyl record*|drum machine*',
  ],
  [
    'Biology',
    'biolog*|species|genus|plant|plants|animal*|bird*|mammal*|fish|fishes|insect*|bacteri*|virus*|gene|genes|genetic*|genom*|protein*|cell|cells|enzyme*|evolution*|natural selection|ecolog*|ecosystem*|organism*|anatom*|physiolog*|botan*|zoolog*|fung*|dna|rna|neuron*|neuroscien*|taxon*|reptile*|amphibian*|dinosaur*|microb*|photosynthesis|mitochondri*',
  ],
  [
    'Philosophy',
    'philosoph*|ethic*|metaphysic*|epistemolog*|logic|logician*|stoic*|existential*|theolog*|moral*|ontolog*|aesthetics|nihilis*|utilitarian*|school of thought|rationalis*|empiricis*',
  ],
  [
    'Computer science',
    'comput*|software|programming|programmer*|algorithm*|internet|web|website*|database*|operating system*|artificial intelligence|machine learning|data structure*|cryptograph*|encryption|open-source|cybersecurity|search engine*|hash table*|graph theory|autocomplete',
  ],
  [
    'History',
    'histor*|ancient|medieval|empire*|dynast*|war|wars|battle*|revolution*|kingdom*|emperor*|archaeolog*|civili[sz]ation*|colonial*|treaty|treaties|renaissance|middle ages|bronze age|iron age|roman|byzantine|ottoman|siege*|pharaoh*|silk road',
  ],
  [
    'Geography',
    'geograph*|city|cities|town|towns|village*|country|countries|capital|river*|mountain*|lake*|island*|ocean*|sea|desert*|region*|province*|county|district*|municipalit*|continent*|peninsula*|valley*|volcano*|forest*|rainforest*|national park*|commune*|borough*|populated place*|settlement*|archipelago*|glacier*|coast*',
  ],
];

const MATCHERS: readonly (readonly [SubjectId, RegExp])[] = TABLE.map(([subject, words]) => {
  const body = words
    .split('|')
    .map((w) => (w.endsWith('*') ? w.slice(0, -1) + '[a-z]*' : w))
    .join('|');
  return [subject, new RegExp('(?<![a-z])(?:' + body + ')(?![a-z])', 'g')] as const;
});

const BY_NAME = new Map<string, SubjectId>(TABLE.map(([subject]) => [subject.toLowerCase(), subject]));

/** What is known about an article when its subject is decided. Only the title is required. */
export interface SubjectClues {
  title: string;
  description?: string | undefined;
  /** Category names, with or without the "Category:" prefix. */
  categories?: readonly string[] | undefined;
}

function hits(re: RegExp, text: string): number {
  if (!text) return 0;
  return new Set(Array.from(text.matchAll(re), (m) => m[0])).size;
}

/**
 * The colour family of an article. The short description counts most, then the title, then categories,
 * because a description says what the article is while categories also say what it is merely near.
 */
export function subjectOf(clues: SubjectClues): SubjectId {
  const title = clues.title.replace(/\s*\(.*\)$/, '').toLowerCase();
  const named = BY_NAME.get(title);
  if (named !== undefined) return named;
  const description = (clues.description ?? '').toLowerCase();
  const categories = (clues.categories ?? []).map((c) => c.replace(/^Category:/, '').toLowerCase()).join(' ; ');
  let best = NEUTRAL_SUBJECT;
  let top = 0;
  for (const [subject, re] of MATCHERS) {
    const score = 3 * hits(re, description) + 2 * hits(re, title) + Math.min(4, hits(re, categories));
    if (score > top) {
      top = score;
      best = subject;
    }
  }
  return best;
}
