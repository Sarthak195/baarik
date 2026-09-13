import type { Verdict } from '@/core/enforceability/types';
import type { Severity } from '@/core/risk/types';
import type { Party } from '@/schemas/finding';

/**
 * The four visual risk signals.
 *
 * The core's `Severity` has four levels and the enforceability table has six verdicts,
 * but a reader scanning a report on a phone can hold about four categories in their
 * head. This collapses both vocabularies into the four the interface actually shows.
 *
 * Every signal is carried on three independent channels — an icon, a distinct outline
 * shape, and a word — so that none of it depends on colour. A greyscale print, a
 * deuteranopic reader and a screen reader all receive the same four categories. Colour
 * is the fourth channel and the only one that is allowed to be redundant.
 */
export type RiskSignal = 'challenged' | 'risky' | 'standard' | 'favourable';

/** Tailwind class names per signal. Kept beside the mapping so the two cannot drift. */
export interface SignalPalette {
  readonly text: string;
  readonly surface: string;
  readonly border: string;
}

const PALETTES: Readonly<Record<RiskSignal, SignalPalette>> = {
  challenged: {
    text: 'text-challenged',
    surface: 'bg-challenged-bg',
    border: 'border-challenged/35',
  },
  risky: { text: 'text-risky', surface: 'bg-risky-bg', border: 'border-risky/35' },
  standard: { text: 'text-standard', surface: 'bg-standard-bg', border: 'border-standard/30' },
  favourable: { text: 'text-favour', surface: 'bg-favour-bg', border: 'border-favour/35' },
};

export function paletteFor(signal: RiskSignal): SignalPalette {
  return PALETTES[signal];
}

/**
 * Verdicts that mean "a court has a settled reason not to give this clause its face
 * value". They outrank the risk score, because a clause that is void is not merely
 * risky — it is the single most useful thing this product can tell a reader.
 */
const CHALLENGED_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>([
  'likely_void',
  'likely_unenforceable_as_written',
  'cannot_oust_this_forum',
  'capped_by_statute',
]);

export interface SignalInput {
  /** The severity of the rubric rule that fired on this clause, if any fired. */
  readonly severity: Severity | null;
  /** The enforceability verdict for the construct this clause contains, if any. */
  readonly verdict: Verdict | null;
  /** Who the clause protects, as reported by the extractor and grounded to a quote. */
  readonly benefits: Party;
}

/**
 * Reduce the two orthogonal signals to one.
 *
 * Order matters and is not arbitrary: enforceability first because it is a statement
 * about the law rather than about this document, then severity, and only then the
 * "in your favour" case — a clause that benefits the reader but still triggered a
 * high-severity rule is not in their favour.
 */
export function signalFor({ severity, verdict, benefits }: SignalInput): RiskSignal {
  if (verdict !== null && CHALLENGED_VERDICTS.has(verdict)) return 'challenged';
  if (severity === 'critical' || severity === 'high' || severity === 'medium') return 'risky';
  if (benefits === 'you') return 'favourable';
  return 'standard';
}
