/** Why a request to the provider failed, as far as the reader needs to know. */
export type Failure = 'missing' | 'unreachable' | 'cancelled';

/**
 * Sort a rejected provider call. A cancelled request needs no message, a network or server fault is
 * not the reader's typo, and anything else means the article does not exist.
 */
export function failureOf(err: unknown): Failure {
  const name = err instanceof Error ? err.name : '';
  if (name === 'AbortError') return 'cancelled';
  // SyntaxError is a reply that was not JSON, such as a captive portal page; ApiError is a 200 that carries an error body.
  if (name === 'HttpError' || name === 'ApiError' || name === 'SyntaxError' || name === 'TypeError' || name === 'TimeoutError') return 'unreachable';
  return 'missing';
}

export const UNREACHABLE_NOTE = 'Could not reach Wikipedia just now. Try again in a moment.';
