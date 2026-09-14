import { describe, expect, it } from 'vitest';

import { verifyAnswer } from '@/app/api/ask/verify-answer';
import type { QaAnswer } from '@/schemas/qa-answer';

/**
 * The guarantee this whole capability rests on.
 *
 * A question-answering feature that cites the document is worth having; one that cites
 * a passage the document does not contain is worse than nothing, because the citation
 * is what persuades the reader to act. These tests are the assertion that an answer
 * only becomes a citation after `locateQuote` has agreed.
 */

const DOCUMENT = [
  'EMPLOYMENT OFFER — MERIDIAN ANALYTICS PRIVATE LIMITED',
  '',
  '4.1 The Employee shall serve a notice period of ninety (90) days before resignation, ' +
    'failing which the Employee shall pay three months of gross salary in lieu thereof.',
  '',
  '7.2 The Employee shall not, for a period of twenty-four months following cessation of ' +
    'employment, join any competitor of the Company anywhere in India.',
].join('\n');

function answer(fields: Partial<QaAnswer>): QaAnswer {
  return {
    foundInDocument: true,
    answer: 'The notice period is ninety days.',
    exactQuote: null,
    certainty: 'stated',
    ...fields,
  };
}

describe('verifyAnswer', () => {
  it('grounds an answer whose quote is in the document', () => {
    const outcome = verifyAnswer(
      answer({
        exactQuote: 'The Employee shall serve a notice period of ninety (90) days before resignation',
      }),
      DOCUMENT,
    );

    expect(outcome.kind).toBe('grounded');
    if (outcome.kind !== 'grounded') return;
    expect(outcome.answer).toBe('The notice period is ninety days.');
    expect(outcome.certainty).toBe('stated');
    expect(DOCUMENT).toContain(outcome.quote);
  });

  it('returns the document text rather than the model copy of it', () => {
    // Smart quotes and collapsed whitespace are what a model does to a passage it
    // retypes. The reader must be shown their own characters, not the model's.
    const outcome = verifyAnswer(
      answer({
        exactQuote:
          'the employee shall not,  for a period of twenty-four months following cessation of employment',
      }),
      DOCUMENT,
    );

    expect(outcome.kind).toBe('grounded');
    if (outcome.kind !== 'grounded') return;
    expect(DOCUMENT).toContain(outcome.quote);
    expect(outcome.quote).toContain('The Employee shall not');
  });

  it('discards an answer whose quote is not in the document', () => {
    const outcome = verifyAnswer(
      answer({
        answer: 'You are entitled to a provident fund contribution of twelve per cent.',
        exactQuote:
          'The Company shall contribute twelve per cent of basic salary to the provident fund.',
      }),
      DOCUMENT,
    );

    // Not merely un-cited: the prose goes too. An unlocatable quote means the sentence
    // it was supporting cannot be checked either.
    expect(outcome).toEqual({ kind: 'unverified' });
  });

  it('discards an answer that claims the document answers the question but quotes nothing', () => {
    expect(verifyAnswer(answer({ exactQuote: null }), DOCUMENT)).toEqual({ kind: 'unverified' });
  });

  it('discards a quote too short to be located unambiguously', () => {
    // Below LOCATE_DEFAULTS.minQuoteLength. A three-word match could be anywhere.
    expect(verifyAnswer(answer({ exactQuote: 'the Employee' }), DOCUMENT)).toEqual({
      kind: 'unverified',
    });
  });

  it('keeps a refusal as a refusal, with its explanation and no quote', () => {
    const outcome = verifyAnswer(
      answer({
        foundInDocument: false,
        answer: 'This document does not mention provident fund.',
        exactQuote: null,
        certainty: 'not_addressed',
      }),
      DOCUMENT,
    );

    expect(outcome).toEqual({
      kind: 'not_in_document',
      answer: 'This document does not mention provident fund.',
    });
  });

  it('ignores a quote offered alongside a refusal', () => {
    // A model that sets foundInDocument false and then supplies a passage anyway is
    // contradicting itself, and the safe reading is the refusal.
    const outcome = verifyAnswer(
      answer({
        foundInDocument: false,
        answer: 'The document does not deal with gratuity.',
        exactQuote: 'The Employee shall serve a notice period of ninety (90) days',
      }),
      DOCUMENT,
    );

    expect(outcome.kind).toBe('not_in_document');
    expect(outcome).not.toHaveProperty('quote');
  });
});
