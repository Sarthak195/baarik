import { z } from 'zod';

/**
 * An answer to a question about the uploaded document.
 *
 * `foundInDocument` is the field that earns its place. A reader who asks about
 * provident fund and gets a plausible figure the document never contained has been
 * actively misled; one who is told the document is silent has learned something true
 * and useful. The refusal therefore has a schema field and a UI state of its own,
 * rather than being an error or an apology embedded in prose.
 */
export const QaAnswerSchema = z.object({
  foundInDocument: z
    .boolean()
    .describe(
      'True only when the document itself answers the question. False when it is silent ' +
        'on the point — which is a useful answer, not a failure.',
    ),

  answer: z
    .string()
    .min(1)
    .max(1200)
    .describe(
      'The answer in plain words. When foundInDocument is false, say plainly which part ' +
        'of the question the document does not address.',
    ),

  exactQuote: z
    .string()
    .max(600)
    .nullable()
    .describe(
      'The passage relied on, copied from the document character for character. Null ' +
        'when foundInDocument is false. A quote that cannot be located is discarded.',
    ),

  /** Distinguishes "the document says X" from "the document says something adjacent to X". */
  certainty: z
    .enum(['stated', 'implied', 'not_addressed'])
    .describe(
      'stated: the document says this directly. implied: it follows from what the ' +
        'document says. not_addressed: the document does not deal with it.',
    ),
});
export type QaAnswer = z.infer<typeof QaAnswerSchema>;
