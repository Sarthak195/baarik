import { z } from 'zod';

import { DocumentType } from '../../schemas/document-type';
import { ConstructId, NUMERIC_FACT_FIELDS } from '../../schemas/extracted-facts';
import type { Predicate } from '../risk/types';

/**
 * The shape of the legal knowledge base.
 *
 * Rubric rules live in YAML under `data/rubric/` so that adding legal knowledge to
 * this system does not require writing TypeScript. That is the maintainability claim
 * the project makes, and these schemas are what make it safe: a malformed rule fails
 * at boot with a line number rather than silently never firing.
 *
 * Parsing YAML is I/O-adjacent and happens in the server layer; this module validates
 * the already-parsed plain objects, so it stays pure and unit-testable.
 */

/**
 * Field names are checked against the real facts vocabulary here rather than in a
 * separate test, so a rule naming a field that does not exist fails at boot with the
 * offending value instead of silently never firing.
 */
const FieldName = z.enum(NUMERIC_FACT_FIELDS);

/**
 * The predicate grammar, recursive. Kept small and closed on purpose: every operator
 * here must have a defined answer for missing data, and a larger vocabulary would
 * make that property harder to hold.
 */
export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ op: z.enum(['gte', 'gt', 'lte', 'lt']), field: FieldName, value: z.number() }),
    z.object({
      op: z.literal('ratio_gte'),
      numerator: FieldName,
      denominator: FieldName,
      value: z.number(),
    }),
    z.object({
      op: z.literal('multiple_gte'),
      field: FieldName,
      of: FieldName,
      divideBaseBy: z.number().positive().optional(),
      value: z.number(),
    }),
    z.object({ op: z.enum(['construct_present', 'construct_absent']), construct: ConstructId }),
    z.object({ op: z.literal('field_missing'), field: FieldName }),
    z.object({ op: z.enum(['all_of', 'any_of']), of: z.array(PredicateSchema).min(1) }),
    z.object({ op: z.literal('not'), of: PredicateSchema }),
  ]),
);

/** A benchmark the rule is measured against, so a threshold is never bare assertion. */
export const BenchmarkSchema = z.object({
  source: z.string().min(1),
  url: z.url(),
  text: z.string().min(1),
});

export const RubricRuleSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'Rule ids are lower_snake_case so they are greppable in data/'),
  title: z.string().min(1).max(120),
  /** Empty means the rule applies to every document type. */
  appliesTo: z.array(DocumentType).default([]),
  when: PredicateSchema,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  /** Contribution to the raw score before tier capping and saturation. */
  weight: z.number().positive().max(50),
  /**
   * Rendered against this document's numbers. Both languages are required, because a
   * rule that exists only in English silently degrades the Hindi experience rather
   * than failing loudly.
   */
  explain: z.object({ en: z.string().min(1), hi: z.string().min(1) }),
  benchmark: BenchmarkSchema.optional(),
  askYourLawyer: z.string().min(1).nullable().default(null),
  /** Which fact's citation to surface next to the finding. */
  evidenceFrom: z.string().optional(),
});
export type RubricRuleInput = z.infer<typeof RubricRuleSchema>;

export const RubricFileSchema = z.object({
  version: z.string().min(1),
  tier: z.enum(['asymmetry', 'threshold', 'construct', 'absence']),
  rules: z.array(RubricRuleSchema).min(1),
});

export const RubricWeightsSchema = z.object({
  version: z.string().min(1),
  /** `k` in `score = 100 * (1 - e^(-raw/k))`. Larger means a gentler curve. */
  saturation: z.number().positive(),
  tierCaps: z.object({
    asymmetry: z.number().positive(),
    threshold: z.number().positive(),
    construct: z.number().positive(),
    absence: z.number().positive(),
  }),
  bands: z
    .array(z.object({ upTo: z.number().min(0).max(100), band: z.enum(['low', 'moderate', 'high', 'severe']) }))
    .min(1),
});
export type RubricWeights = z.infer<typeof RubricWeightsSchema>;
