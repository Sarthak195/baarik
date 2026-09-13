import 'server-only';

import type { DocumentType, OutputLanguage, ReadingLevel } from '../../schemas/document-type';
import { buildSystemInstruction } from './shared/guardrails';

/**
 * Clause finding — the prompt whose output is checked hardest.
 *
 * Every quote returned here is verified against the document by
 * `src/core/grounding/verify.ts` before it can be rendered as a citation, and a
 * finding whose quote cannot be located is discarded and counted. The instruction
 * leans on that: the model is told plainly that an inexact quote is thrown away, which
 * is a far more effective constraint than asking it to be careful.
 */
export const FIND_CLAUSES_SYSTEM = buildSystemInstruction(`
You identify the clauses in a contract that a reader would want to know about, and you
explain each one in plain words.

THE QUOTE IS THE EVIDENCE. For each finding, "exactQuote" must be copied from the
document character for character: same words, same punctuation, same order, same
spelling including any typo. Do not paraphrase, do not tidy, do not join sentences
that are not adjacent in the document, and do not stitch a quote together from two
places.

Every quote you return is checked against the document by an exact-match algorithm
before the reader sees it. A quote that cannot be found is discarded and counted as a
failure, so a finding you cannot quote exactly is worth less than no finding at all.

WHAT TO REPORT. Prefer the clauses that change what happens to the reader: money they
must pay, time they are bound for, rights they give up, what happens if either side
walks away, and who decides a dispute. A clause that merely recites a definition or
restates the law is not a finding.

"isUnusual" is true only when a clause is materially harsher than the ordinary Indian
market norm for this kind of agreement. A clause is not unusual merely because it
imposes an obligation — contracts impose obligations. If you are unsure, it is false.

WHAT NOT TO DO. Do not say a clause is unfair, void, illegal or unenforceable; that is
decided elsewhere in this system. Describe what it requires and what follows from it,
and let the reader and the rules engine draw the conclusion.
`);

export interface FindClausesOptions {
  readonly documentType: DocumentType;
  readonly language: OutputLanguage;
  readonly readingLevel: ReadingLevel;
  readonly maxFindings: number;
}

export function buildFindClausesInstruction(options: FindClausesOptions): string {
  return [
    `Find the clauses in this ${humanType(options.documentType)} that matter to the reader.`,
    `Return at most ${String(options.maxFindings)} findings, in the order they appear in the document.`,
    languageDirective(options.language),
    readingLevelDirective(options.readingLevel),
    'Number the findings f1, f2, f3 and so on in that same reading order.',
  ].join('\n\n');
}

/**
 * The verbatim quote is never translated.
 *
 * A citation that has been translated is no longer a citation: the reader cannot find
 * it in their own document, and the grounding verifier would reject it anyway, since
 * it matches against the source text.
 */
function languageDirective(language: OutputLanguage): string {
  if (language === 'en') {
    return 'Write "plainSummary" in English.';
  }
  return [
    'Write "plainSummary" in Hindi, in Devanagari script.',
    'Do NOT translate "exactQuote" — it must stay exactly as printed in the document,',
    'in the document\'s own language. A translated quote cannot be found in the',
    'document and will be discarded.',
  ].join(' ');
}

function readingLevelDirective(readingLevel: ReadingLevel): string {
  if (readingLevel === 'simple') {
    return [
      'Write for a reader who has not finished school. Sentences of fourteen words or',
      'fewer. No legal vocabulary at all — say "you cannot leave before" rather than',
      '"lock-in", and "money you put down" rather than "security deposit". One idea per',
      'sentence.',
    ].join(' ');
  }
  return [
    'Write at a class-8 reading level. A legal term may be used once it has been',
    'explained in the same sentence.',
  ].join(' ');
}

function humanType(documentType: DocumentType): string {
  switch (documentType) {
    case 'rent_agreement':
      return 'rent agreement';
    case 'employment_offer':
      return 'offer letter';
    case 'loan_agreement':
      return 'loan agreement';
    case 'nda':
      return 'non-disclosure agreement';
    case 'freelance_contract':
      return 'freelance contract';
    case 'privacy_policy':
      return 'privacy policy';
    case 'other':
      return 'document';
  }
}
