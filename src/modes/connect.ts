import type { DataProvider } from '../types';
import { esc } from '../lib';
import { graphOf, route } from './graph';
import { PAR_DEPTH } from './race';

/** A chain search is asked for by hand, so it may look a little wider than a background par search. */
export const CONNECT_BUDGET = 14;
export const CONNECT_BEAM = 4;
/** How long the map rests on each article while it walks the chain. */
const STEP_MS = 2600;

export type ConnectState =
  | { step: 'form'; from: string; to: string; note?: string }
  | { step: 'picking' }
  | { step: 'searching'; from: string; to: string }
  | { step: 'chain'; chain: string[]; at: number; walking: boolean };

/** The shortest chain found between two articles, or null. Every link in it can be clicked on the map. */
export function chainBetween(provider: DataProvider, from: string, to: string): Promise<string[] | null> {
  return route(graphOf(provider), from, to, { maxDepth: PAR_DEPTH, budget: CONNECT_BUDGET, beam: CONNECT_BEAM });
}

const button = (id: string, text: string): string => "<button class='lk' type='button' id='" + id + "'>" + text + '</button>';
const field = (name: string, label: string, value: string): string =>
  '<label>' + label + " <input name='" + name + "' type='text' list='clist' autocomplete='off' spellcheck='false' required value=\"" + esc(value) + '"></label>';

/** The Connect two card: the form, the wait, then the chain with the current stop lit. */
export function connectHtml(s: ConnectState): string {
  if (s.step === 'picking') return "<div class='line'>Picking two articles…</div>";
  if (s.step === 'searching') return "<div class='line'>Looking for a chain from " + esc(s.from) + ' to <em>' + esc(s.to) + '</em>…</div>';
  if (s.step === 'form')
    return (
      "<form id='cform'><div class='line'>Connect two articles</div><div class='pair'>" +
      field('from', 'From', s.from) +
      field('to', 'To', s.to) +
      "<button class='gbtn' type='submit'>Connect</button>" +
      button('csurprise', 'Surprise me') +
      "</div><datalist id='clist'></datalist>" +
      (s.note ? "<div class='note'>" + esc(s.note) + '</div>' : '') +
      "<div class='stats'>" +
      button('quit', 'Quit') +
      '</div></form>'
    );
  const links = s.chain.length - 1;
  return (
    "<ol class='chain'>" +
    s.chain
      .map(
        (t, i) => '<li' + (i === s.at ? " class='at'" : i < s.at ? " class='past'" : '') + '><button class="lk" type="button" data-t="' + esc(t) + '">' + esc(t) + '</button></li>',
      )
      .join('') +
    "</ol><div class='stats'><span>" +
    links +
    (links === 1 ? ' link' : ' links') +
    '</span>' +
    (s.walking ? button('cstop', 'Stop') : button('creplay', 'Walk it again')) +
    button('csurprise', 'Surprise pair') +
    button('cnew', 'Choose pair') +
    button('quit', 'Quit') +
    '</div>'
  );
}

/** What Connect two needs from the map screen. */
export interface ConnectHost {
  readonly provider: DataProvider;
  /** The article at the centre of the map, if any. */
  current(): string | null;
  /** Start the map over at an article. Resolves to the title the provider settled on, or null when it failed. */
  open(title: string): Promise<string | null>;
  /** Travel to an article from where the map is. Resolves to false when it failed. */
  travel(title: string): Promise<boolean>;
  /** Ring a star on the map, or clear the ring. */
  mark(title: string | null): void;
  /** Redraw the card. */
  render(state: ConnectState | null): void;
  wait(ms: number): Promise<void>;
}

/** Connect two: type two articles, and the map walks the shortest chain found between them. */
export class Connect {
  state: ConnectState | null = null;
  /** Counts runs, so a walk that has been overtaken stops quietly. */
  private seq = 0;

  constructor(private readonly host: ConnectHost) {}

  /** Show the form, starting from wherever the map is. */
  start(note?: string, to = ''): void {
    this.seq++;
    this.host.mark(null);
    this.set({ step: 'form', from: this.state?.step === 'chain' ? (this.state.chain[0] ?? '') : (this.host.current() ?? ''), to, ...(note ? { note } : {}) });
  }

  /** Leave the mode. */
  stop(): void {
    this.seq++;
    this.state = null;
  }

  /** Find a chain between two typed titles and walk it. */
  async run(typedFrom: string, typedTo: string): Promise<void> {
    const seq = ++this.seq;
    const from = typedFrom.trim();
    const to = typedTo.trim();
    if (!from || !to) return;
    this.set({ step: 'searching', from, to });
    const start = await this.host.open(from);
    if (seq !== this.seq) return;
    if (start === null) return this.fail(from, to, 'No article called “' + from + '” was found.');
    // The provider follows redirects: search on the titles it actually uses.
    const end = await this.host.provider.summary(to).then(
      (s) => s.title || to,
      () => to,
    );
    if (seq !== this.seq) return;
    if (end === start) return this.fail(start, to, 'Those are the same article. Pick two different ones.');
    const chain = await chainBetween(this.host.provider, start, end);
    if (seq !== this.seq) return;
    if (!chain) return this.fail(start, to, 'No chain of ' + PAR_DEPTH + ' links or fewer was found. Try two articles that are closer.');
    await this.walk(chain);
  }

  /** Pick a pair for the reader, then connect it. A pick that fails goes back to the form with a note. */
  async surprise(pick: () => Promise<{ start: string; target: string }>): Promise<void> {
    const seq = ++this.seq;
    this.host.mark(null);
    this.set({ step: 'picking' });
    let pair: { start: string; target: string };
    try {
      pair = await pick();
    } catch {
      if (seq === this.seq) this.set({ step: 'form', from: '', to: '', note: 'Could not pick a pair just now. Try again, or type two articles.' });
      return;
    }
    if (seq === this.seq) await this.run(pair.start, pair.target);
  }

  /** Walk the chain again from its first article. */
  async replay(): Promise<void> {
    if (this.state?.step !== 'chain') return;
    const chain = this.state.chain;
    const seq = ++this.seq;
    const start = await this.host.open(chain[0] ?? '');
    if (seq === this.seq && start !== null) await this.walk(chain);
  }

  /** Stop walking and leave the chain on show. */
  halt(): void {
    if (this.state?.step !== 'chain') return;
    this.seq++;
    this.host.mark(null);
    this.set({ ...this.state, walking: false });
  }

  private async walk(chain: string[]): Promise<void> {
    const seq = this.seq;
    for (let at = 0; at < chain.length; at++) {
      const next = chain[at + 1];
      this.host.mark(next ?? null);
      this.set({ step: 'chain', chain, at, walking: next !== undefined });
      if (next === undefined) return;
      await this.host.wait(STEP_MS);
      // The reader may have clicked away or quit while the map rested.
      if (seq !== this.seq || this.host.current() !== chain[at]) return this.settle(seq, chain, at);
      const ok = await this.host.travel(next);
      if (seq !== this.seq || !ok) return this.settle(seq, chain, at);
    }
  }

  private settle(seq: number, chain: string[], at: number): void {
    if (seq !== this.seq) return;
    this.host.mark(null);
    this.set({ step: 'chain', chain, at, walking: false });
  }

  private fail(from: string, to: string, note: string): void {
    this.set({ step: 'form', from, to, note });
  }

  private set(state: ConnectState): void {
    this.state = state;
    this.host.render(state);
  }
}
