/**
 * The shared contract. Every module agrees on these shapes.
 * Change this file only in its own pull request titled "contract: ...", with auto-merge off.
 */
export type Rank = 1 | 2 | 3 | 4 | 5;
export type SubjectId = string; // one of the subject colour families

export interface Star {
  title: string;
  subject: SubjectId;
  linksOut: boolean; // the centre article links to this one
  linksIn: boolean; // this article links to the centre
  nameMatch: boolean; // its title resembles the centre's
  rank: Rank; // derived from the three flags
  score: number; // order within a rank, higher is closer
}

export interface Constellation {
  center: { title: string; subject: SubjectId };
  stars: Star[]; // sorted by rank, then score
}

export interface Suggestion {
  title: string;
  description?: string;
  thumbnail?: string;
}
export interface ArticleSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

export interface DataProvider {
  suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]>;
  constellation(title: string, signal?: AbortSignal): Promise<Constellation>;
  summary(title: string, signal?: AbortSignal): Promise<ArticleSummary>;
  random(signal?: AbortSignal): Promise<string>;
  neighbours(title: string, signal?: AbortSignal): Promise<string[]>; // for race par
}
