import type { ConstructId, NumericFactField, Presence } from '../../schemas/extracted-facts';
import type { DocumentType } from '../../schemas/document-type';
import type { QuoteLocation } from '../grounding/types';

/**
 * Three-valued truth. `unknown` is a first-class answer, not an error state.
 *
 * The rule that governs the whole engine: if a predicate needs a fact the document
 * did not yield, the answer is `unknown` — never `false`. Collapsing unknown to false
 * would make "this contract has no deposit-refund deadline" fire on every document
 * the extractor merely failed to read.
 */
export type Trilean = 'true' | 'false' | 'unknown';

export type Tier = 'asymmetry' | 'threshold' | 'construct' | 'absence';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * The predicate vocabulary a rubric rule may use.
 *
 * Deliberately small and closed. A rule is data under `data/rubric/*.yaml`, so adding
 * legal knowledge to this system does not require writing TypeScript — which is the
 * maintainability claim the project actually makes.
 */
export type Predicate =
  | { readonly op: 'gte'; readonly field: NumericFactField; readonly value: number }
  | { readonly op: 'gt'; readonly field: NumericFactField; readonly value: number }
  | { readonly op: 'lte'; readonly field: NumericFactField; readonly value: number }
  | { readonly op: 'lt'; readonly field: NumericFactField; readonly value: number }
  | {
      /** `numerator / denominator >= value`. The asymmetry primitive. */
      readonly op: 'ratio_gte';
      readonly numerator: NumericFactField;
      readonly denominator: NumericFactField;
      readonly value: number;
    }
  | {
      /** `field / (of / divideBaseBy) >= value`, e.g. deposit against monthly rent. */
      readonly op: 'multiple_gte';
      readonly field: NumericFactField;
      readonly of: NumericFactField;
      /** Optional because most bases need no scaling; explicitly `| undefined` to
       *  satisfy `exactOptionalPropertyTypes` when built from a parsed YAML object. */
      readonly divideBaseBy?: number | undefined;
      readonly value: number;
    }
  | { readonly op: 'construct_present'; readonly construct: ConstructId }
  | { readonly op: 'construct_absent'; readonly construct: ConstructId }
  | { readonly op: 'field_missing'; readonly field: NumericFactField }
  | { readonly op: 'all_of'; readonly of: readonly Predicate[] }
  | { readonly op: 'any_of'; readonly of: readonly Predicate[] }
  | { readonly op: 'not'; readonly of: Predicate };

/**
 * The read-only view of extracted facts that the rubric sees.
 *
 * An interface rather than the raw object so that evidence lookup travels with the
 * values: every fired rule can point at the quote that produced the number, which is
 * what makes a risk score auditable instead of assertive.
 */
export interface FactView {
  number(field: NumericFactField): number | null;
  construct(id: ConstructId): Presence;
  /**
   * Accepts a plain string because rubric rules name their evidence source in YAML,
   * where the value has not yet been narrowed. An unrecognised name yields null — a
   * missing highlight, never a missing finding.
   */
  evidenceFor(field: string): QuoteLocation | null;
  readonly documentType: DocumentType;
}

/** A rule that fired, with the arithmetic that made it fire. */
export interface RiskDriver {
  readonly ruleId: string;
  readonly tier: Tier;
  readonly severity: Severity;
  readonly title: string;
  /** The rule's template rendered against this document's actual numbers. */
  readonly explain: string;
  readonly points: number;
  readonly evidence: QuoteLocation | null;
  readonly askYourLawyer: string | null;
}

/**
 * A rule that could not be evaluated because a fact was missing.
 *
 * This is the productive end of the unknown-propagation chain: an ungrounded quote
 * becomes a null fact, a null fact makes a predicate return `unknown`, and an
 * `unknown` becomes a numbered question in the lawyer-preparation pack. A failure of
 * extraction surfaces as a question rather than as a silent wrong answer.
 */
export interface UnknownFact {
  readonly ruleId: string;
  readonly missing: readonly string[];
  readonly question: string;
}

export interface RiskReport {
  /** 0..100, higher means riskier for the reader. Saturating; see `engine.ts`. */
  readonly score: number;
  readonly band: 'low' | 'moderate' | 'high' | 'severe';
  readonly drivers: readonly RiskDriver[];
  readonly topDrivers: readonly RiskDriver[];
  readonly unknowns: readonly UnknownFact[];
  readonly tierTotals: Readonly<Record<Tier, number>>;
  readonly rubricVersion: string;
}
