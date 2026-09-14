import { z } from 'zod';

/**
 * The document types Baarik understands deeply.
 *
 * Each has a fair-market baseline under `data/baselines/` and a tier-4 absence
 * checklist, which is what makes "this agreement never says when your deposit comes
 * back" possible. `other` degrades to generic clause analysis with an honest banner
 * rather than pretending to knowledge the system does not have.
 */
export const DocumentType = z.enum([
  'rent_agreement',
  'employment_offer',
  'loan_agreement',
  'nda',
  'freelance_contract',
  'privacy_policy',
  'other',
]);
export type DocumentType = z.infer<typeof DocumentType>;

/**
 * Output language. This is a parameter of the generation prompts, not merely UI
 * chrome: the model writes its plain-language explanation in this language, while
 * verbatim quotes and statute citations always stay in the source language.
 */
export const OutputLanguage = z.enum(['en', 'hi']);
export type OutputLanguage = z.infer<typeof OutputLanguage>;

/** How much the reader wants unpacked. A real prompt change, not a CSS class. */
export const ReadingLevel = z.enum(['standard', 'simple']);
export type ReadingLevel = z.infer<typeof ReadingLevel>;

/**
 * A document type the reader chose from the landing form, or `undefined`.
 *
 * The form's first option is "let Baarik work it out" and posts an empty string, so
 * absence and "no preference" are the same answer and both arrive here as `undefined`.
 * An unrecognised value is treated the same way rather than rejected: the field comes
 * from a `<select>`, so anything else is a hand-crafted request, and silently falling
 * back to classification is a better answer than a 400 for a preference.
 */
export function parseDocumentType(value: string | undefined): DocumentType | undefined {
  const parsed = DocumentType.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
