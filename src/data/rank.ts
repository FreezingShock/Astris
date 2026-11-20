import type { Rank } from '../types';

/**
 * The five-rank rule. Three flags in, one rank out.
 * 1 all three, 2 links both ways, 3 one link plus a name match, 4 one link, 5 name only.
 */
export function rankOf(linksOut: boolean, linksIn: boolean, nameMatch: boolean): Rank {
  if (linksOut && linksIn && nameMatch) return 1;
  if (linksOut && linksIn) return 2;
  if ((linksOut || linksIn) && nameMatch) return 3;
  if (linksOut || linksIn) return 4;
  return 5;
}

/** The most stars one constellation may hold. */
export const MAX_STARS = 200;
