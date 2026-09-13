import { describe, expect, it } from 'vitest';

import { foldForMatching } from '@/core/document/fold';
import { locateQuote } from '@/core/grounding/locate';
import { LOCATE_DEFAULTS } from '@/core/grounding/types';

/**
 * The hallucination gate.
 *
 * These tests are the product's correctness core: they define exactly which quotes
 * are accepted as grounded and which are refused. A quote that is accepted becomes a
 * citation shown to a user who may act on it, so the bias throughout is toward
 * refusing rather than guessing.
 */

const CONTRACT = [
  'EMPLOYMENT AGREEMENT',
  '',
  '7.1 The Employee shall serve a notice period of ninety (90) days prior to resignation.',
  '',
  '7.2 The Company may terminate this agreement by giving thirty (30) days written notice.',
  '',
  '9.4 The Employee shall not, for a period of twenty-four (24) months following cessation',
  'of employment, engage with any competing business within the territory of India.',
  '',
  '11.3 The Employee shall pay a sum of Rs. 2,00,000 as training cost reimbursement if the',
  'Employee resigns before completing twenty-four (24) months of continuous service.',
].join('\n');

describe('locateQuote', () => {
  it('locates a quote copied exactly, and reports the exact method', () => {
    const quote = 'The Company may terminate this agreement by giving thirty (30) days written notice.';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    expect(outcome.location.method).toBe('exact');
    expect(outcome.location.similarity).toBe(1);
    expect(CONTRACT.slice(outcome.location.start, outcome.location.end)).toBe(quote);
  });

  it('locates a quote whose straight apostrophes and dashes were typographically drifted', () => {
    // A model re-emitting a clause commonly "tidies" hyphens into en-dashes.
    const quote = 'a period of twenty–four (24) months following cessation';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    expect(outcome.location.method).toBe('normalised');
    // The reported text is what the DOCUMENT says, never what the model said.
    expect(outcome.location.matchedText).toContain('twenty-four');
  });

  it('locates a quote whose line break was collapsed into a space', () => {
    const quote =
      'engage with any competing business within the territory of India.';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    expect(CONTRACT.slice(outcome.location.start, outcome.location.end)).toContain('India');
  });

  it('locates a quote spanning a hard line break in the source', () => {
    // The model reads the clause as one sentence; the PDF stored it across two lines.
    const quote =
      'The Employee shall not, for a period of twenty-four (24) months following cessation of employment, engage with any competing business';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    expect(outcome.location.method).toBe('normalised');
  });

  it('tolerates a single OCR-style substitution via fuzzy matching', () => {
    // "ninety (90) days" misread as "nlnety (90) days" — one character.
    const quote = 'The Employee shall serve a notlce period of ninety (90) days prior to resignation.';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    expect(outcome.location.method).toBe('fuzzy');
    expect(outcome.location.similarity).toBeGreaterThanOrEqual(LOCATE_DEFAULTS.minSimilarity);
    expect(outcome.location.matchedText).toContain('notice period');
  });

  it('REFUSES a fabricated clause that does not appear in the document', () => {
    const quote =
      'The Company shall reimburse all relocation expenses incurred by the Employee up to Rs. 50,000.';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('unverified');
    if (outcome.status !== 'unverified') return;
    expect(['not_found', 'below_threshold']).toContain(outcome.reason);
  });

  it('REFUSES a quote too short to locate unambiguously', () => {
    const outcome = locateQuote(CONTRACT, 'the Employee');

    expect(outcome).toEqual({ status: 'unverified', reason: 'quote_too_short' });
  });

  it('REFUSES an empty or whitespace-only quote', () => {
    expect(locateQuote(CONTRACT, '   \n  ')).toEqual({
      status: 'unverified',
      reason: 'quote_empty',
    });
  });

  it('REFUSES an ambiguous quote matching two near-identical clauses', () => {
    const repetitive = [
      'The Tenant shall pay the maintenance charges within seven days of demand hereunder.',
      'Some unrelated intervening text about the schedule of the premises and fixtures.',
      'The Tenant shall pay the maintenance charges within seven days of demand hereunder.',
    ].join('\n\n');

    const outcome = locateQuote(
      repetitive,
      // Deliberately drifted so exact and normalised both miss and fuzzy must decide.
      'The Tenant shall pay the maintenance charges within seven days of demandx hereunder.',
    );

    expect(outcome.status).toBe('unverified');
    if (outcome.status !== 'unverified') return;
    expect(outcome.reason).toBe('ambiguous');
  });

  it('returns byte-accurate offsets into the ORIGINAL string, not the folded one', () => {
    const quote = 'Rs. 2,00,000 as training cost reimbursement';
    const outcome = locateQuote(CONTRACT, quote);

    expect(outcome.status).toBe('grounded');
    if (outcome.status !== 'grounded') return;
    // The invariant the whole citation UI depends on.
    expect(CONTRACT.slice(outcome.location.start, outcome.location.end)).toBe(
      outcome.location.matchedText,
    );
  });

  it('produces identical results whether or not a shared fold index is supplied', () => {
    const quote = 'thirty (30) days written notice';
    const withoutIndex = locateQuote(CONTRACT, quote);
    const withIndex = locateQuote(CONTRACT, quote, LOCATE_DEFAULTS, foldForMatching(CONTRACT));

    expect(withIndex).toEqual(withoutIndex);
  });
});
