import { z } from 'zod';

import { DocumentType } from './document-type';

/**
 * The contract between the language model and the deterministic risk engine.
 *
 * Everything the rubric reasons about arrives through this object. The model's job
 * ends here: it reports what the document says, and TypeScript decides what that
 * means. Nothing downstream asks the model whether a clause is fair, valid or void.
 */

/**
 * Tri-state, deliberately not a boolean.
 *
 * Tier-4 absence detection — "this agreement never says when your deposit comes
 * back" — is only sound if "the model did not find it" and "the model checked and it
 * is not there" are different states. A boolean silently converts ignorance into an
 * accusation, and would make every absence rule fire on a document the extractor
 * simply failed to read.
 */
export const Presence = z.enum(['present', 'absent', 'unclear']);
export type Presence = z.infer<typeof Presence>;

/**
 * Named contract constructs the rubric can test for.
 *
 * The first group are clauses whose PRESENCE is the problem; the second are clauses
 * whose ABSENCE is. Keeping both in one vocabulary is what lets a single rule
 * language express "this contract has a trap" and "this contract is missing a
 * protection" without special cases.
 */
export const ConstructId = z.enum([
  // Present-is-bad.
  'unilateral_amendment_without_notice',
  'unilateral_arbitrator_appointment',
  'contractual_limitation_period',
  'self_help_remedy',
  'forfeiture_of_paid_amounts',
  'sole_discretion_on_payment',
  'post_employment_non_compete',
  'unlimited_indemnity',
  'automatic_renewal_without_notice',
  'assignment_of_future_ip',
  'class_action_waiver',
  'cross_default',
  // Absent-is-bad.
  'deposit_refund_timeline',
  'notice_period_for_you',
  'exit_or_termination_route',
  'jurisdiction_clause',
  'data_retention_limit',
  'liability_cap_in_your_favour',
  'rent_increase_cap',
  'grievance_officer_named',
]);
export type ConstructId = z.infer<typeof ConstructId>;

export const ConstructAssertionSchema = z.object({
  construct: ConstructId,
  presence: Presence.describe(
    'Use "absent" ONLY after reading the whole document and finding nothing on this ' +
      'point. Use "unclear" when the document mentions something related but you cannot ' +
      'tell. Never answer "absent" because you did not look.',
  ),
  exactQuote: z
    .string()
    .max(600)
    .nullable()
    .describe('Verbatim supporting text when presence is "present". Null otherwise.'),
});

export const FactCitationSchema = z.object({
  field: z.string().max(60).describe('The name of the numeric field this quote supports.'),
  exactQuote: z.string().min(12).max(400),
});

/**
 * Units are fixed here rather than inferred downstream, because a rubric threshold
 * like "lock-in longer than six months" is meaningless if the field might be in days.
 */
export const ExtractedFactsSchema = z.object({
  documentType: DocumentType,
  governingLawState: z.string().max(60).nullable(),
  jurisdictionCity: z.string().max(60).nullable(),

  // Durations. Notice in DAYS; everything else in MONTHS. Null means "not determined".
  noticeDaysYouMustGive: z.number().int().min(0).max(3650).nullable(),
  noticeDaysTheyMustGive: z.number().int().min(0).max(3650).nullable(),
  cureDaysYouGet: z.number().int().min(0).max(3650).nullable(),
  cureDaysTheyGet: z.number().int().min(0).max(3650).nullable(),
  lockInMonths: z.number().min(0).max(600).nullable(),
  termMonths: z.number().min(0).max(1200).nullable(),
  depositRefundDays: z.number().int().min(0).max(730).nullable(),
  paymentTermDays: z.number().int().min(0).max(365).nullable(),
  dataRetentionDays: z.number().int().min(0).max(36500).nullable(),
  confidentialityMonths: z.number().min(0).max(12000).nullable(),
  nonCompeteMonths: z.number().min(0).max(600).nullable(),

  // Money, in RUPEES as a plain number. Convert "1.5 lakh" to 150000, "2 Cr" to 20000000.
  monthlyRentInr: z.number().nonnegative().nullable(),
  securityDepositInr: z.number().nonnegative().nullable(),
  annualRentIncreasePercent: z.number().min(0).max(200).nullable(),
  annualCtcInr: z.number().nonnegative().nullable(),
  bondAmountInr: z.number().nonnegative().nullable(),
  bondMonths: z.number().min(0).max(240).nullable(),
  principalInr: z.number().nonnegative().nullable(),
  annualInterestPercent: z.number().min(0).max(500).nullable(),
  processingFeePercent: z.number().min(0).max(100).nullable(),
  prepaymentPenaltyPercent: z.number().min(0).max(100).nullable(),
  latePaymentPercentPerMonth: z.number().min(0).max(100).nullable(),
  liabilityCapInr: z.number().nonnegative().nullable(),

  constructs: z.array(ConstructAssertionSchema).max(24),
  citations: z.array(FactCitationSchema).max(40),
});
export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

/** Field names the rubric may reference in a numeric predicate. */
export type NumericFactField = {
  [K in keyof ExtractedFacts]: ExtractedFacts[K] extends number | null ? K : never;
}[keyof ExtractedFacts];

/**
 * The same vocabulary as a runtime value, so a YAML rule naming a field that does not
 * exist fails at boot with the offending id rather than silently never firing.
 *
 * The satisfies clause ties the two together: adding a numeric field to the schema
 * without listing it here is a type error, and listing one that is not numeric is too.
 */
export const NUMERIC_FACT_FIELDS = [
  'noticeDaysYouMustGive',
  'noticeDaysTheyMustGive',
  'cureDaysYouGet',
  'cureDaysTheyGet',
  'lockInMonths',
  'termMonths',
  'depositRefundDays',
  'paymentTermDays',
  'dataRetentionDays',
  'confidentialityMonths',
  'nonCompeteMonths',
  'monthlyRentInr',
  'securityDepositInr',
  'annualRentIncreasePercent',
  'annualCtcInr',
  'bondAmountInr',
  'bondMonths',
  'principalInr',
  'annualInterestPercent',
  'processingFeePercent',
  'prepaymentPenaltyPercent',
  'latePaymentPercentPerMonth',
  'liabilityCapInr',
] as const satisfies readonly NumericFactField[];
