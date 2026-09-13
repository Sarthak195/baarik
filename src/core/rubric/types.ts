import type { DocumentType } from '../../schemas/document-type';
import type { Predicate, Severity, Tier } from '../risk/types';

/** A benchmark a threshold is measured against, so a number is never bare assertion. */
export interface Benchmark {
  readonly source: string;
  readonly url: string;
  readonly text: string;
}

/**
 * One rubric rule, after validation.
 *
 * Rules are authored in YAML under `data/rubric/` and never in TypeScript. That is
 * the maintainability claim this project makes: adding legal knowledge is a data
 * change a non-programmer can review in a diff.
 */
export interface RubricRule {
  readonly id: string;
  readonly tier: Tier;
  readonly title: string;
  /** Empty means the rule applies to every document type. */
  readonly appliesTo: readonly DocumentType[];
  readonly when: Predicate;
  readonly severity: Severity;
  readonly weight: number;
  readonly explain: { readonly en: string; readonly hi: string };
  readonly benchmark: Benchmark | null;
  readonly askYourLawyer: string | null;
  readonly evidenceFrom: string | null;
}

export interface RubricConfig {
  readonly saturation: number;
  readonly tierCaps: Readonly<Record<Tier, number>>;
  readonly bands: readonly { readonly upTo: number; readonly band: RiskBand }[];
}

export type RiskBand = 'low' | 'moderate' | 'high' | 'severe';

/** Everything the risk engine needs, parsed and validated once at boot. */
export interface KnowledgeBase {
  readonly version: string;
  readonly rules: readonly RubricRule[];
  readonly config: RubricConfig;
}
