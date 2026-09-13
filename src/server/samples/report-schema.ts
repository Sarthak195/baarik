import 'server-only';
import { z } from 'zod';

import type { AnalysisOutcome } from '../../core/report/types';
import { DocumentType, OutputLanguage } from '../../schemas/document-type';
import { RawFindingSchema } from '../../schemas/finding';
import {
  EnforceabilityRuleSchema,
  ForumRouteSchema,
  LimitationRuleSchema,
} from '../knowledge/schemas';

/**
 * The runtime shape of a committed golden analysis.
 *
 * A report the server builds from parts it already validated does not need
 * re-validating — but a report READ BACK FROM DISK does. `golden/reports/*.json` is
 * hand-editable, survives merges, and is copied into a container by a Dockerfile that
 * can silently miss it. Without this schema a truncated or half-written file renders
 * as a report with no findings and no risk, which is the single most dangerous thing
 * this product could show someone: a one-sided contract that looks clean.
 *
 * So the sample path fails loudly instead. The schema mirrors `AnalysisReport` field
 * for field, and `parseSampleOutcome`'s declared return type is what keeps the two in
 * step — a field added to the report type and forgotten here is a compile error.
 *
 * The statute, forum and limitation rows are reused from the knowledge schemas rather
 * than restated: a golden report embeds those rows verbatim, and two copies of one
 * definition drift.
 */

const QuoteLocationSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  method: z.enum(['exact', 'normalised', 'fuzzy']),
  similarity: z.number().min(0).max(1),
  /** The text present in the document, never the model's version of it. */
  matchedText: z.string(),
});

const UngroundedReason = z.enum([
  'quote_empty',
  'quote_too_short',
  'not_found',
  'below_threshold',
  'ambiguous',
  'duplicate',
]);

const GroundedFindingSchema = RawFindingSchema.extend({
  location: QuoteLocationSchema,
  segmentId: z.string().nullable(),
  pageNumber: z.number().int().positive().nullable(),
});

const GroundingStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  grounded: z.number().int().nonnegative(),
  exact: z.number().int().nonnegative(),
  normalised: z.number().int().nonnegative(),
  fuzzy: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  rejectionsByReason: z.object({
    quote_empty: z.number().int().nonnegative(),
    quote_too_short: z.number().int().nonnegative(),
    not_found: z.number().int().nonnegative(),
    below_threshold: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
  }),
});

const Severity = z.enum(['low', 'medium', 'high', 'critical']);

const RiskDriverSchema = z.object({
  ruleId: z.string().min(1),
  tier: z.enum(['asymmetry', 'threshold', 'construct', 'absence']),
  severity: Severity,
  title: z.string().min(1),
  explain: z.string().min(1),
  points: z.number(),
  evidence: QuoteLocationSchema.nullable(),
  askYourLawyer: z.string().nullable(),
});

const RiskReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  band: z.enum(['low', 'moderate', 'high', 'severe']),
  drivers: z.array(RiskDriverSchema),
  topDrivers: z.array(RiskDriverSchema),
  unknowns: z.array(
    z.object({
      ruleId: z.string().min(1),
      missing: z.array(z.string()),
      question: z.string().min(1),
    }),
  ),
  tierTotals: z.object({
    asymmetry: z.number(),
    threshold: z.number(),
    construct: z.number(),
    absence: z.number(),
  }),
  rubricVersion: z.string().min(1),
});

const ConsistencySiteSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string(),
  segmentId: z.string().nullable(),
  segmentLabel: z.string().nullable(),
  pageNumber: z.number().int().positive().nullable(),
});

const InconsistencySchema = z.object({
  kind: z.enum([
    'dangling_cross_reference',
    'undefined_term',
    'unused_definition',
    'figure_word_mismatch',
    'conflicting_quantity',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string().min(1),
  detail: z.string().min(1),
  at: ConsistencySiteSchema,
  counterpart: ConsistencySiteSchema.nullable(),
});

/**
 * `deadline` is a `Date` on the wire as an ISO string, so it is coerced back on read.
 * A clock is only ever populated once the reader says when the problem happened, which
 * a recorded sample never does — but a schema that silently accepted a string here
 * would hand the renderer something that is not a Date and fail at `toISOString`.
 */
const LimitationClockSchema = z.object({
  ruleId: z.string().min(1),
  deadline: z.coerce.date(),
  daysRemaining: z.number().int(),
  urgency: z.enum(['ample', 'act_soon', 'urgent', 'expired']),
  condonationPossible: z.boolean(),
  statute: z.string().min(1),
  statuteUrl: z.string().min(1),
});

const NextStepSchema = z.object({
  forum: ForumRouteSchema,
  limitationRule: LimitationRuleSchema.nullable(),
  clock: LimitationClockSchema.nullable(),
  signals: z.array(
    z.object({
      kind: z.enum(['problem', 'construct', 'verdict', 'risk_driver', 'situation', 'universal']),
      detail: z.string(),
    }),
  ),
  priority: z.number(),
});

const AnalysisReportSchema = z.object({
  reportId: z.string().min(1),
  documentHash: z.string().min(1),
  documentType: DocumentType,
  language: OutputLanguage,

  risk: RiskReportSchema,
  findings: z.array(GroundedFindingSchema),
  rejected: z.array(z.object({ finding: RawFindingSchema, reason: UngroundedReason })),
  grounding: GroundingStatsSchema,

  enforceability: z.array(
    EnforceabilityRuleSchema.extend({ evidence: QuoteLocationSchema.nullable() }),
  ),
  inconsistencies: z.array(InconsistencySchema),
  nextSteps: z.array(NextStepSchema),

  meta: z.object({
    rubricVersion: z.string().min(1),
    modelsUsed: z.array(z.string().min(1)),
    stageTimingsMs: z.record(z.string(), z.number()),
    truncated: z.boolean(),
    readAsScan: z.boolean(),
    generatedAt: z.string().min(1),
  }),
});

/**
 * A refusal is stored exactly like a report, under the same `kind` discriminant the
 * live pipeline returns. The supermarket receipt is a sample in its own right — the
 * demo's first error case — and giving it a different file shape would make the one
 * path that must never call the model the one path with a special case in it.
 */
export const SampleOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('report'), report: AnalysisReportSchema }),
  z.object({ kind: z.literal('not_a_document'), reason: z.string().min(1) }),
]);

export type SampleParse =
  | { readonly ok: true; readonly outcome: AnalysisOutcome }
  | { readonly ok: false; readonly message: string };

/**
 * The declared return type is load-bearing: it is what makes this schema and
 * `AnalysisOutcome` impossible to drift apart without the build failing.
 */
export function parseSampleOutcome(value: unknown): SampleParse {
  const parsed = SampleOutcomeSchema.safeParse(value);
  if (parsed.success) return { ok: true, outcome: parsed.data };

  // The first few issues, with their paths, so the message names the broken field
  // rather than reprinting the whole document back at whoever has to fix it.
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return { ok: false, message: issues.join('; ') };
}
