import { describe, expect, it } from 'vitest';

import { toCanonicalDocument } from '@/core/document/normalise';
import { verifyFindings } from '@/core/grounding/verify';
import type { RawFinding } from '@/schemas/finding';

const SOURCE = [
  '7.1 The Employee shall serve a notice period of ninety (90) days prior to resignation.',
  '',
  '7.2 The Company may terminate this agreement by giving thirty (30) days written notice.',
  '',
  '11.3 The Employee shall pay a sum of Rs. 2,00,000 as training cost reimbursement.',
].join('\n');

const DOCUMENT = toCanonicalDocument(
  { text: SOURCE, pageTexts: [SOURCE], source: 'text', offsetsReliable: true },
  'test-hash',
);

function finding(overrides: Partial<RawFinding> & { id: string; exactQuote: string }): RawFinding {
  return {
    category: 'termination',
    clauseLabel: null,
    plainSummary: 'A summary written for the reader.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: false,
    ...overrides,
  };
}

describe('verifyFindings', () => {
  it('grounds a real quote and attaches its clause and page', () => {
    const report = verifyFindings(DOCUMENT, [
      finding({
        id: 'f1',
        exactQuote: 'The Company may terminate this agreement by giving thirty (30) days written notice.',
      }),
    ]);

    expect(report.grounded).toHaveLength(1);
    expect(report.rejected).toHaveLength(0);
    expect(report.grounded[0]?.segmentId).not.toBeNull();
    expect(report.grounded[0]?.pageNumber).toBe(1);
  });

  it('rejects a fabricated clause rather than rendering it as a citation', () => {
    const report = verifyFindings(DOCUMENT, [
      finding({
        id: 'f1',
        exactQuote: 'The Company shall grant the Employee twenty-five days of paid annual leave.',
      }),
    ]);

    expect(report.grounded).toHaveLength(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.stats.grounded).toBe(0);
  });

  it('keeps the honest total: nothing is dropped without being counted', () => {
    const report = verifyFindings(DOCUMENT, [
      finding({ id: 'f1', exactQuote: 'The Employee shall serve a notice period of ninety (90) days' }),
      finding({ id: 'f2', exactQuote: 'An entirely invented clause about relocation allowances.' }),
      finding({ id: 'f3', exactQuote: 'short' }),
    ]);

    expect(report.stats.total).toBe(3);
    expect(report.stats.grounded + report.stats.rejected).toBe(report.stats.total);
    expect(report.stats.rejectionsByReason.quote_too_short).toBe(1);
  });

  it('de-duplicates the same span reported twice under one category', () => {
    const quote = 'The Employee shall pay a sum of Rs. 2,00,000 as training cost reimbursement.';
    const report = verifyFindings(DOCUMENT, [
      finding({ id: 'f1', exactQuote: quote, category: 'penalty' }),
      finding({ id: 'f2', exactQuote: quote, category: 'penalty' }),
    ]);

    expect(report.grounded).toHaveLength(1);
    expect(report.rejected[0]?.reason).toBe('duplicate');
  });

  it('keeps one span reported under two genuinely different categories', () => {
    // A training bond really is both a penalty and a restraint on leaving.
    const quote = 'The Employee shall pay a sum of Rs. 2,00,000 as training cost reimbursement.';
    const report = verifyFindings(DOCUMENT, [
      finding({ id: 'f1', exactQuote: quote, category: 'penalty' }),
      finding({ id: 'f2', exactQuote: quote, category: 'restraint_of_trade' }),
    ]);

    expect(report.grounded).toHaveLength(2);
  });

  it('counts matches by method so the report can say how it found each quote', () => {
    const report = verifyFindings(DOCUMENT, [
      finding({ id: 'f1', exactQuote: 'thirty (30) days written notice, as provided herein' }),
      finding({
        id: 'f2',
        exactQuote: 'The Employee shall serve a notice period of ninety (90) days prior to resignation.',
      }),
    ]);

    expect(report.stats.exact).toBe(1);
    expect(report.stats.exact + report.stats.normalised + report.stats.fuzzy).toBe(
      report.stats.grounded,
    );
  });
});
