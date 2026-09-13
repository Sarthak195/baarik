import type { Span } from '../document/types';

/**
 * Internal consistency of a contract.
 *
 * This is the one capability in the product where a language model is not merely
 * unnecessary but actively worse than code. "Does clause 14.2 exist?" requires the
 * reader to hold the entire document in attention and enumerate it; a model will
 * answer fluently either way and cannot show its working, and the answer changes
 * between runs. A set-membership test cannot be fluent and cannot disagree with
 * itself. The same is true of every check here: a defined term is either in the
 * definitions or it is not, and ninety either equals 90 or it does not.
 *
 * So nothing in this module asks a model anything. Every finding is decided by
 * string arithmetic over `CanonicalDocument.text` and carries the character range
 * that produced it, which means the user can be shown the evidence rather than
 * asked to trust the conclusion.
 */

export type InconsistencyKind =
  /** A reference to a clause number the document does not contain. */
  | 'dangling_cross_reference'
  /** A quoted, capitalised term used in the body that no clause defines. */
  | 'undefined_term'
  /** A term defined and then never referred to again — usually a copy-paste remnant. */
  | 'unused_definition'
  /** "ninety (90)" where the words and the figure state different numbers. */
  | 'figure_word_mismatch'
  /** The same concept given two different values in two different clauses. */
  | 'conflicting_quantity';

/**
 * Severity is about what the inconsistency does to a reader, not about how sure the
 * detector is. A figure that disagrees with its own words decides how much money
 * changes hands, so it is `high`; an unused definition is untidy drafting and is
 * `low` even though the detection is certain.
 */
export type InconsistencySeverity = 'low' | 'medium' | 'high';

/**
 * One highlightable end of a finding: a span into the canonical text plus the
 * coordinates a reader actually navigates by.
 */
export interface ConsistencySite extends Span {
  /** The text present at this range. Rendering this, never a paraphrase, is the point. */
  readonly quote: string;
  readonly segmentId: string | null;
  /** The clause number as printed, e.g. "7.2". Null outside any numbered clause. */
  readonly segmentLabel: string | null;
  readonly pageNumber: number | null;
}

export interface Inconsistency {
  readonly kind: InconsistencyKind;
  readonly severity: InconsistencySeverity;
  readonly title: string;
  /** Rendered against this document's own text; never a generic description. */
  readonly detail: string;
  readonly at: ConsistencySite;
  /**
   * The other end, for findings that are inherently about two places — a conflict
   * between clause 7 and clause 12 is not a fact about either one alone. Null for
   * findings that have a single location.
   */
  readonly counterpart: ConsistencySite | null;
}

export interface ConsistencyOptions {
  /**
   * Days per month and per year when comparing durations. A contract that says
   * "one month" in clause 4 and "30 days" in clause 9 means the same thing, and
   * reporting that as a conflict would be noise; the cost is that a genuine
   * 30-versus-31-day subtlety is invisible, which is not a risk a reader can act on.
   */
  readonly monthDays: number;
  readonly yearDays: number;
  /** How far back from a quantity to look for the concept it measures. */
  readonly conceptWindow: number;
  /** Quoted strings longer than this are prose being quoted, not defined terms. */
  readonly maxTermChars: number;
}

export const CONSISTENCY_DEFAULTS: ConsistencyOptions = {
  monthDays: 30,
  yearDays: 365,
  // Wide enough to span "the Tenant shall give the Landlord not less than", short
  // enough that the concept named in the previous sentence does not bleed into this one.
  conceptWindow: 90,
  maxTermChars: 60,
};
