import 'server-only';
import { z } from 'zod';

import { DocumentType } from '../../schemas/document-type';
import { ConstructId } from '../../schemas/extracted-facts';

/**
 * Runtime schemas for the YAML tables that `src/core/rubric/schema.ts` does not cover:
 * the forum router, the limitation rules, and the enforceability statute table.
 *
 * They live in the server layer because that is where YAML is read. The core consumes
 * already-parsed data and never touches a file — see ADR 0001.
 *
 * Every list field defaults, so a YAML row may omit what it does not use. That keeps
 * the data files readable: a row that has no prerequisites simply has no
 * `prerequisites` key rather than an empty array nobody reads.
 */

const Severity = z.enum(['low', 'medium', 'high', 'critical']);

const Verdict = z.enum([
  'likely_void',
  'likely_unenforceable_as_written',
  'capped_by_statute',
  'cannot_oust_this_forum',
  'enforceable_but_negotiable',
  'context_dependent',
]);

/**
 * Caveats are mandatory throughout, and `.min(1)` is how that is enforced rather than
 * left to review. A verdict or a forum shown without what it does not decide is the
 * failure ADR 0005 exists to prevent.
 */
const Caveats = z.array(z.string().min(1)).min(1);

// ---------------------------------------------------------------------------
// Forums
// ---------------------------------------------------------------------------

const ForumTriggerSchema = z.object({
  documentTypes: z.array(DocumentType).default([]),
  problems: z
    .array(
      z.enum([
        'goods_or_services_defect',
        'builder_delay_or_refund',
        'unpaid_salary_or_termination',
        'unpaid_invoice',
        'bank_or_loan_conduct',
        'insurance_claim',
        'platform_action_or_privacy',
      ]),
    )
    .default([]),
  constructs: z.array(ConstructId).default([]),
  verdicts: z.array(Verdict).default([]),
  driverSeverities: z.array(Severity).default([]),
  situations: z.array(z.enum(['cannot_afford_lawyer', 'prefers_settlement'])).default([]),
  universal: z.boolean().default(false),
});

export const ForumRouteSchema = z.object({
  id: z.enum([
    'consumer_commission',
    'rera_authority',
    'labour_conciliation',
    'msefc',
    'rbi_ombudsman',
    'insurance_ombudsman',
    'grievance_appellate_committee',
    'legal_services_authority',
    'lok_adalat',
  ]),
  name: z.string().min(1),
  handles: z.string().min(1),
  statute: z.string().min(1),
  statuteUrl: z.url(),
  portal: z.object({ name: z.string().min(1), url: z.url() }),
  helpline: z.string().min(1).nullable().default(null),
  fee: z.object({
    summary: z.string().min(1),
    amountInr: z.number().nonnegative().nullable().default(null),
    freeForClaimsUpToInr: z.number().nonnegative().nullable().default(null),
  }),
  filingPlace: z.string().min(1).nullable().default(null),
  lawyerRequired: z.boolean().default(false),
  prerequisites: z
    .array(
      z.object({
        step: z.string().min(1),
        waitDays: z.number().int().nonnegative().nullable().default(null),
        url: z.url().nullable().default(null),
      }),
    )
    .default([]),
  entitlements: z.array(z.string().min(1)).default([]),
  limitationRuleId: z.string().min(1).nullable().default(null),
  triggers: ForumTriggerSchema,
  caveats: Caveats,
});

export const ForumsFileSchema = z.object({
  version: z.string().min(1),
  forums: z.array(ForumRouteSchema).min(1),
});

// ---------------------------------------------------------------------------
// Limitation
// ---------------------------------------------------------------------------

export const LimitationRuleSchema = z.object({
  id: z.string().min(1),
  causeOfAction: z.string().min(1),
  // Months and days are never interchanged: thirty days is not a month in February,
  // so the statute's own unit is carried through to the arithmetic.
  period: z.object({ unit: z.enum(['months', 'days']), count: z.number().int().nonnegative() }),
  statute: z.string().min(1),
  statuteUrl: z.url(),
  condonationPossible: z.boolean(),
  stages: z
    .array(
      z.object({
        label: z.string().min(1),
        days: z.number().int().nonnegative(),
        from: z.string().min(1),
        statute: z.string().min(1),
      }),
    )
    .default([]),
});

export const LimitationFileSchema = z.object({
  version: z.string().min(1),
  rules: z.array(LimitationRuleSchema).min(1),
});

// ---------------------------------------------------------------------------
// Enforceability
// ---------------------------------------------------------------------------

export const EnforceabilityRuleSchema = z.object({
  construct: ConstructId,
  verdict: Verdict,
  confidence: z.enum(['high', 'medium', 'low']),
  statute: z.object({
    act: z.string().min(1),
    section: z.string().min(1),
    // The operative words, so a reader can check rather than trust.
    text: z.string().min(1),
    statuteUrlIsRoot: z.boolean().optional(),
    url: z.url(),
  }),
  authorities: z
    .array(
      z.object({
        cite: z.string().min(1),
        holding: z.string().min(1),
        url: z.url().nullable().default(null),
      }),
    )
    .default([]),
  plainMeaning: z.string().min(1),
  caveats: Caveats,
  appliesTo: z.array(z.string().min(1)).default([]),
});

export const EnforceabilityFileSchema = z.object({
  version: z.string().min(1),
  rules: z.array(EnforceabilityRuleSchema).min(1),
});
