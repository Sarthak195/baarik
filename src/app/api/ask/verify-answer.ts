import 'server-only';

import type { AnswerOutcome } from '@/components/qa/types';
import { locateQuote } from '@/core/grounding/locate';
import type { QaAnswer } from '@/schemas/qa-answer';

/**
 * The hallucination gate, applied to an answer rather than to a finding.
 *
 * A finding that cannot be matched to the document is dropped from the report and
 * listed as discarded; the reader never sees it presented as a citation. An answer to
 * a direct question deserves at least that, and arguably more: a finding is one card
 * among twenty that a reader skims, while an answer is the thing they asked for and
 * therefore the thing they will act on.
 *
 * So the same `locateQuote` runs against the same document text, with the same
 * defaults, and the same rule applies — nothing that fails is rendered as a citation.
 * The quote that comes back is the document's own characters, not the model's copy of
 * them, which is what makes the passage on the page verifiable against the source
 * section further down.
 */
export function verifyAnswer(answer: QaAnswer, documentText: string): AnswerOutcome {
  if (!answer.foundInDocument) {
    return { kind: 'not_in_document', answer: answer.answer };
  }

  // Claiming the document answers the question and then offering nothing to point at
  // is the same failure as offering a passage that is not there.
  const quote = answer.exactQuote;
  if (quote === null) return { kind: 'unverified' };

  const located = locateQuote(documentText, quote);
  if (located.status !== 'grounded') return { kind: 'unverified' };

  return {
    kind: 'grounded',
    answer: answer.answer,
    quote: located.location.matchedText,
    certainty: answer.certainty,
  };
}
