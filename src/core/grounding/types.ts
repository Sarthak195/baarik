import type { Span } from '../document/types';

/**
 * How a quote was matched to the document, in decreasing order of confidence.
 * Surfaced to the user, because "we found this exactly" and "we found something
 * 87% similar" are different claims and should not look alike.
 */
export type GroundingMethod = 'exact' | 'normalised' | 'fuzzy';

export interface QuoteLocation extends Span {
  readonly method: GroundingMethod;
  /** 1 for exact and normalised matches; the Dice score for fuzzy ones. */
  readonly similarity: number;
  /**
   * The text actually present in the document at this range — never the model's
   * version of it. Rendering this rather than the model's string is what makes a
   * citation a citation.
   */
  readonly matchedText: string;
}

export type UngroundedReason =
  /** The model returned an empty or whitespace-only quote. */
  | 'quote_empty'
  /** Too short to locate unambiguously; see `LOCATE_DEFAULTS.minQuoteLength`. */
  | 'quote_too_short'
  /** No candidate window came close enough to be worth scoring. */
  | 'not_found'
  /** The best candidate scored below `minSimilarity`. */
  | 'below_threshold'
  /** Two distant candidates scored within `ambiguityMargin` of each other. */
  | 'ambiguous'
  /** A different finding already claimed this exact range. */
  | 'duplicate';

export type GroundingOutcome =
  | { readonly status: 'grounded'; readonly location: QuoteLocation }
  | { readonly status: 'unverified'; readonly reason: UngroundedReason };

export interface LocateOptions {
  /** Below this Dice similarity, refuse to claim a match. */
  readonly minSimilarity: number;
  /** Quotes shorter than this are rejected rather than guessed at. */
  readonly minQuoteLength: number;
  /** If a second, distant candidate scores this close to the best, call it ambiguous. */
  readonly ambiguityMargin: number;
}

/**
 * Tuned so that a genuine clause survives PDF whitespace damage and light OCR noise,
 * while a fabricated clause does not slip through. Raising `minSimilarity` costs
 * recall on scanned documents; lowering it admits hallucinations. 0.82 sits above
 * the score an unrelated clause of similar length reaches by chance.
 */
export const LOCATE_DEFAULTS: LocateOptions = {
  minSimilarity: 0.82,
  minQuoteLength: 24,
  ambiguityMargin: 0.05,
};
