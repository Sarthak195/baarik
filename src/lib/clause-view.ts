import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import type { GroundedFinding } from '@/core/grounding/verify';
import type { RiskDriver } from '@/core/risk/types';
import type { Benchmark } from '@/core/rubric/types';
import type { Party } from '@/schemas/finding';

/**
 * One clause, assembled from every engine that had something to say about it.
 *
 * The clause card is the product. Its seven rows are fixed for every clause, every
 * document type and every language, which means the card component must never reach
 * for data itself — it renders exactly this object and nothing else. Anything the card
 * cannot render from a `ClauseView` is a row the card does not have.
 *
 * Note what is NOT here: no prose written by the card, no severity word, no colour.
 * Those are derived in `severity.ts` and named in `src/i18n`, so that a clause card in
 * Hindi is the same component with a different dictionary rather than a second card.
 */

/**
 * What the system is willing to claim about this row.
 *
 * `depends_on_your_state` is a real and common answer in Indian law rather than a
 * hedge: rent control, stamp duty, shops-and-establishments notice periods and legal
 * aid ceilings all differ by state, and a national answer to a state question would be
 * confidently wrong.
 */
export type ClauseConfidence = 'confident' | 'depends_on_your_state' | 'not_found_in_document';

/**
 * The `[how is this computed?]` payload for the Taraazu meter.
 *
 * `steps` is the arithmetic in words — "They may terminate on 30 days' notice, you must
 * give 90, a ratio of 3 : 1 against you" — and it is the whole point of the disclosure.
 * A meter the reader cannot audit is decoration; a meter that shows its working is the
 * difference between "an LLM said so" and "a system determined so".
 */
export interface FavoursArithmetic {
  readonly side: Party;
  /** Paired rights that landed on the reader's side, out of `pairedRights`. */
  readonly yourShare: number;
  readonly pairedRights: number;
  readonly steps: readonly string[];
}

/** One of the three things a reader can actually do, with the words to do it in. */
export interface ClauseAction {
  readonly kind: 'ask' | 'accept' | 'walk_away';
  readonly label: string;
  /** Replacement wording the reader can paste into an email. Null where none applies. */
  readonly replacementText: string | null;
}

export interface ClauseView {
  readonly finding: GroundedFinding;
  /** The rubric rule that fired on this clause, or null where none did. */
  readonly driver: RiskDriver | null;
  /** The statute row for the construct this clause contains, or null where none applies. */
  readonly enforceability: EnforceabilityVerdict | null;
  /** WHY IT MATTERS — the concrete scenario, carrying this document's own numbers. */
  readonly whyItMatters: string;
  readonly favours: FavoursArithmetic;
  readonly actions: readonly ClauseAction[];
  readonly confidence: ClauseConfidence;
  /**
   * The published figure the driver's number is measured against — capability 2 of the
   * brief, comparison against a statutory or market baseline rather than against a
   * second document the reader does not have.
   *
   * It is carried here rather than on the driver because `RiskDriver` is built in
   * `src/core/risk/engine.ts` and has no benchmark field; the rule does, so the join
   * from driver back to rule happens in `report-view.ts` alongside the other joins.
   *
   * Optional rather than nullable because absence is the normal case: most rules carry
   * no benchmark at all, and that silence is deliberate. A threshold that is this
   * project's own judgement must not be dressed in a citation.
   */
  readonly benchmark?: Benchmark | undefined;
}

/**
 * Derive the confidence row rather than letting anything assert it.
 *
 * A fuzzy quote match and a low-confidence statute row are different reasons to hedge,
 * but both reduce to the same sentence for the reader, so they collapse here and the
 * card shows the grounding method separately for anyone who wants the detail.
 */
export function confidenceFor(
  finding: GroundedFinding,
  enforceability: EnforceabilityVerdict | null,
): ClauseConfidence {
  if (finding.location.method === 'fuzzy') return 'depends_on_your_state';
  if (enforceability !== null && enforceability.confidence === 'low') {
    return 'depends_on_your_state';
  }
  return 'confident';
}
