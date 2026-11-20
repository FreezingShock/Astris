import { classify } from '../data';

/** Why a request to the provider failed, as far as the reader needs to know. */
export type Failure = 'missing' | 'unreachable' | 'cancelled';

/**
 * Sort a rejected provider call coarsely. A cancelled request needs no message, a missing article is the reader's typo,
 * and everything else is Wikipedia being out of reach (see `diagnose` for which way).
 */
export function failureOf(err: unknown): Failure {
  const kind = classify(err, true);
  return kind === 'cancelled' || kind === 'missing' ? kind : 'unreachable';
}

export const UNREACHABLE_NOTE = 'Could not reach Wikipedia just now. Try again in a moment.';
