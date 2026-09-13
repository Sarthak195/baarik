import { z } from 'zod';

import { DocumentType, OutputLanguage } from './document-type';

/**
 * The classifier's answer.
 *
 * `isLegalDocument` gates the whole pipeline. Analysing a supermarket receipt as
 * though it were a contract would not merely waste tokens — it would hand the reader
 * a risk score for a document that has no terms, which misrepresents what the tool
 * can do. Refusing is the correct behaviour and needs its own field.
 */
export const DocumentClassificationSchema = z.object({
  isLegalDocument: z
    .boolean()
    .describe(
      'False for a receipt, invoice, statement, payslip, letter or marketing page — ' +
        'anything that does not set out terms binding two sides.',
    ),

  documentType: DocumentType.describe('The best single match. Use "other" for a contract of another kind.'),

  language: OutputLanguage.describe('The language the document itself is written in.'),

  /** Shown to the reader verbatim when the document is refused, so it must be plain. */
  notLegalReason: z
    .string()
    .max(200)
    .nullable()
    .describe(
      'When isLegalDocument is false, one plain sentence saying what this appears to be ' +
        'instead. Null otherwise.',
    ),

  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('How clearly the document announces its own type.'),
});
export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;
