import type { ConstructId } from '../../schemas/extracted-facts';
import type { QuoteLocation } from '../grounding/types';

/**
 * Enforceability triage.
 *
 * A great many people are bound in practice by clauses that would not survive
 * contact with a court: a two-year non-compete that s.27 of the Indian Contract Act
 * makes void, a thirty-day contractual limitation that s.28(b) voids, an arbitration
 * clause that cannot oust a consumer forum. Telling someone which of the clauses
 * frightening them actually binds is the single most useful thing this product does.
 *
 * Two design rules hold the feature inside the law:
 *
 *   1. **The model never decides this.** Verdicts come from a table of statutes under
 *      `data/enforceability/`, keyed by construct. The model's only contribution is
 *      reporting whether the construct appears in the document.
 *   2. **Nothing is stated as a conclusion about the reader's case.** The product
 *      reports what a statute provides and what courts have held. Advocates Act 1961
 *      ss.29 and 33, read with *BCI v A.K. Balaji* (2018), reserve non-litigious legal
 *      advice to enrolled advocates, so every row carries mandatory caveats and a
 *      citation the reader can check.
 */

export type Verdict =
  /** s.27 Indian Contract Act — post-employment non-compete; s.28(b) — limitation clauses. */
  | 'likely_void'
  /** *Perkins Eastman v HSCC* (2019) — an arbitrator the counterparty alone appoints. */
  | 'likely_unenforceable_as_written'
  /** s.74 + *Kailash Nath v DDA* (2015) — recovery capped at compensation actually proved. */
  | 'capped_by_statute'
  /** *Emaar MGF v Aftab Singh* (2018) — arbitration cannot bar the consumer forum. */
  | 'cannot_oust_this_forum'
  /** Binding, but commonly conceded in negotiation. */
  | 'enforceable_but_negotiable'
  /** Turns on facts the document does not settle. */
  | 'context_dependent';

export interface StatuteRef {
  readonly act: string;
  readonly section: string;
  /** The operative words, quoted, so the reader is not asked to take this on trust. */
  readonly text: string;
  /** Preferably an India Code deep link. */
  readonly url: string;
}

export interface Authority {
  readonly cite: string;
  readonly holding: string;
  readonly url: string | null;
}

/** A row of the statute table. Data under `data/enforceability/`, never code. */
export interface EnforceabilityRule {
  readonly construct: ConstructId;
  readonly verdict: Verdict;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly statute: StatuteRef;
  readonly authorities: readonly Authority[];
  /** One sentence, second person, no jargon. */
  readonly plainMeaning: string;
  /**
   * Required and asserted non-empty by a test. This is the advice boundary expressed
   * in the type system: a verdict may not be shown without what it does not decide.
   */
  readonly caveats: readonly string[];
  /** Which document types the row applies to. Empty means all. */
  readonly appliesTo: readonly string[];
}

export type EnforceabilityTable = readonly EnforceabilityRule[];

/** A rule matched against a document, carrying the evidence that triggered it. */
export interface EnforceabilityVerdict extends EnforceabilityRule {
  readonly evidence: QuoteLocation | null;
}
