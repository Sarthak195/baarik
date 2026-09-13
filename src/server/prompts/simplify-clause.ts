import 'server-only';

import type { OutputLanguage, ReadingLevel } from '../../schemas/document-type';
import { buildSystemInstruction } from './shared/guardrails';

/**
 * Re-explaining one clause on demand.
 *
 * Two controls drive this: a reading-level toggle and a language toggle. Both are real
 * prompt changes rather than presentation, which is why they belong here and not in a
 * stylesheet — and why the same clause visibly produces different prose when either
 * is switched.
 *
 * The clause text is passed as context and the toggles as instruction, so switching a
 * toggle re-uses the cached document prefix.
 */
export const SIMPLIFY_CLAUSE_SYSTEM = buildSystemInstruction(`
You explain one clause of a contract to the person bound by it.

Produce three things and nothing else:
- What it says, in one plain sentence.
- Why it matters, as the concrete situation in which the reader would feel it, using
  the actual figures and dates from the clause. "If you leave in month seven, they can
  claim two lakh rupees from you" beats "this imposes a financial obligation".
- What the reader could do about it: ask for a change, accept it, or walk away — and
  if asking, the exact replacement wording they could propose.

Use the clause's own numbers. Never introduce a figure that is not in it.

Do not say whether the clause is fair, valid, enforceable or void, and do not predict
what a court would do. Describe the clause and its consequences.
`);

export function buildSimplifyClauseInstruction(input: {
  readonly clauseText: string;
  readonly readingLevel: ReadingLevel;
  readonly language: OutputLanguage;
}): string {
  return [
    'Explain this clause:',
    input.clauseText.trim(),
    input.readingLevel === 'simple'
      ? 'Write for a reader who has not finished school. Sentences of fourteen words or fewer, one idea each, and no legal vocabulary at all.'
      : 'Write at a class-8 reading level. A legal term may appear once it has been explained in the same sentence.',
    input.language === 'hi'
      ? 'Write in Hindi, in Devanagari script. Keep any figures in the numerals the document uses.'
      : 'Write in English.',
  ].join('\n\n');
}
