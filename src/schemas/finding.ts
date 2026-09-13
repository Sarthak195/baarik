import { z } from 'zod';

/**
 * What the model is permitted to return for a single clause.
 *
 * `exactQuote` is the contract between the model and the rest of the system: the
 * model asserts this string appears verbatim in the document, and
 * `src/core/grounding/verify.ts` checks that assertion before anything downstream is
 * allowed to render it. Everything else in this object is commentary; the quote is
 * the evidence.
 *
 * The `describe` calls are not documentation — they are shipped to the model as part
 * of the structured-output schema, so their wording is load-bearing.
 */

export const FindingCategory = z.enum([
  'payment',
  'termination',
  'lock_in',
  'deposit',
  'penalty',
  'liability',
  'dispute_resolution',
  'restraint_of_trade',
  'ip_assignment',
  'confidentiality',
  'data_use',
  'unilateral_change',
  'renewal',
  'indemnity',
  'jurisdiction',
  'other',
]);
export type FindingCategory = z.infer<typeof FindingCategory>;

/** Which side of the agreement a clause binds or benefits. */
export const Party = z.enum(['you', 'counterparty', 'both', 'unclear']);
export type Party = z.infer<typeof Party>;

export const RawFindingSchema = z.object({
  id: z
    .string()
    .regex(/^f\d{1,3}$/)
    .describe('Stable identifier f1..f999, assigned in document reading order.'),

  category: FindingCategory,

  exactQuote: z
    .string()
    .min(24)
    .max(600)
    .describe(
      'The clause text copied EXACTLY as printed: same words, same punctuation, same ' +
        'order. Do not paraphrase, do not correct typos, and do not join sentences that ' +
        'are not adjacent in the document. If you cannot copy it exactly, omit the finding.',
    ),

  clauseLabel: z
    .string()
    .max(40)
    .nullable()
    .describe('The clause number exactly as printed, e.g. "7.2". Null if the clause is unnumbered.'),

  plainSummary: z
    .string()
    .min(10)
    .max(400)
    .describe('One sentence at a class-8 reading level, addressed to the reader. No legal jargon.'),

  obligationOn: Party.describe('Who this clause requires to do something.'),

  benefits: Party.describe('Who this clause protects.'),

  isUnusual: z
    .boolean()
    .describe(
      'True only when this clause is materially harsher than the ordinary Indian market ' +
        'norm for this type of agreement. A standard clause is not unusual merely because ' +
        'it imposes an obligation.',
    ),
});
export type RawFinding = z.infer<typeof RawFindingSchema>;

/**
 * Structured-output schemas must stay shallow — one object wrapping one flat array of
 * flat objects. Gemini rejects deeply nested schemas, and a rejection surfaces as an
 * opaque API error rather than a validation message.
 */
export const FindingsPayloadSchema = z.object({
  findings: z.array(RawFindingSchema).max(60),
});
export type FindingsPayload = z.infer<typeof FindingsPayloadSchema>;
