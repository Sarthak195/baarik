import { describe, expect, it } from 'vitest';

import { toCanonicalDocument } from '@/core/document/normalise';
import { buildFactView } from '@/core/risk/fact-view';
import type { ExtractedFacts } from '@/schemas/extracted-facts';

const SOURCE = [
  '5.1 You shall give the Company ninety (90) days written notice of resignation.',
  '',
  '5.2 The Company may terminate your employment by giving thirty (30) days notice.',
  '',
  '6.2 You shall pay Rupees Two Lakh (Rs. 2,00,000) if you resign within twenty-four months.',
  '',
  '7.1 You shall not join any competing business for twenty-four (24) months after leaving.',
].join('\n');

const DOCUMENT = toCanonicalDocument(
  { text: SOURCE, pageTexts: [SOURCE], source: 'text', offsetsReliable: true },
  'hash',
);

function facts(overrides: Partial<ExtractedFacts> = {}): ExtractedFacts {
  return {
    documentType: 'employment_offer',
    governingLawState: null,
    jurisdictionCity: null,
    noticeDaysYouMustGive: null,
    noticeDaysTheyMustGive: null,
    cureDaysYouGet: null,
    cureDaysTheyGet: null,
    lockInMonths: null,
    termMonths: null,
    depositRefundDays: null,
    paymentTermDays: null,
    dataRetentionDays: null,
    confidentialityMonths: null,
    nonCompeteMonths: null,
    monthlyRentInr: null,
    securityDepositInr: null,
    annualRentIncreasePercent: null,
    annualCtcInr: null,
    bondAmountInr: null,
    bondMonths: null,
    principalInr: null,
    annualInterestPercent: null,
    processingFeePercent: null,
    prepaymentPenaltyPercent: null,
    latePaymentPercentPerMonth: null,
    liabilityCapInr: null,
    constructs: [],
    citations: [],
    ...overrides,
  };
}

describe('buildFactView', () => {
  it('keeps a number whose citation is found in the document, and attaches the evidence', () => {
    const { view, demoted } = buildFactView(
      DOCUMENT,
      facts({
        noticeDaysYouMustGive: 90,
        citations: [
          {
            field: 'noticeDaysYouMustGive',
            exactQuote: 'You shall give the Company ninety (90) days written notice of resignation.',
          },
        ],
      }),
    );

    expect(view.number('noticeDaysYouMustGive')).toBe(90);
    expect(demoted).toHaveLength(0);
    expect(view.evidenceFor('noticeDaysYouMustGive')).not.toBeNull();
  });

  /**
   * The chain from ADR 0004: a number the model could not evidence becomes null, a
   * null makes the predicate answer unknown, and an unknown becomes a question for an
   * advocate. A confabulated figure must never reach a threshold.
   */
  it('demotes a number whose citation does not appear in the document', () => {
    const { view, demoted } = buildFactView(
      DOCUMENT,
      facts({
        bondAmountInr: 5_000_000,
        citations: [
          {
            field: 'bondAmountInr',
            exactQuote: 'You shall pay Rupees Fifty Lakh as a retention bonus clawback.',
          },
        ],
      }),
    );

    expect(view.number('bondAmountInr')).toBeNull();
    expect(demoted).toEqual([{ field: 'bondAmountInr', reason: 'citation_not_found' }]);
  });

  it('keeps an uncited number rather than gutting the rubric', () => {
    // Citations are requested on a best-effort basis. Dropping every uncited figure
    // would demote most of a document; positive evidence of confabulation is required.
    const { view, demoted } = buildFactView(DOCUMENT, facts({ noticeDaysTheyMustGive: 30 }));

    expect(view.number('noticeDaysTheyMustGive')).toBe(30);
    expect(demoted).toHaveLength(0);
  });

  it('accepts a construct whose supporting quote is in the document', () => {
    const { view } = buildFactView(
      DOCUMENT,
      facts({
        constructs: [
          {
            construct: 'post_employment_non_compete',
            presence: 'present',
            exactQuote:
              'You shall not join any competing business for twenty-four (24) months after leaving.',
          },
        ],
      }),
    );

    expect(view.construct('post_employment_non_compete')).toBe('present');
    expect(view.evidenceFor('post_employment_non_compete')).not.toBeNull();
  });

  /**
   * The direction of this demotion is the point. Failing to evidence a clause is not
   * evidence that the clause is missing, so an unverifiable "present" becomes
   * "unclear" and never "absent" — which would accuse the contract of an omission on
   * the strength of a bad quote.
   */
  it('downgrades an unverifiable "present" to unclear, never to absent', () => {
    const { view, demoted } = buildFactView(
      DOCUMENT,
      facts({
        constructs: [
          {
            construct: 'unlimited_indemnity',
            presence: 'present',
            exactQuote: 'You shall indemnify the Company without limit for any and all losses.',
          },
        ],
      }),
    );

    expect(view.construct('unlimited_indemnity')).toBe('unclear');
    expect(view.construct('unlimited_indemnity')).not.toBe('absent');
    expect(demoted[0]?.field).toBe('unlimited_indemnity');
  });

  it('passes an "absent" assertion through untouched — there is nothing to verify', () => {
    const { view, demoted } = buildFactView(
      DOCUMENT,
      facts({
        constructs: [
          { construct: 'deposit_refund_timeline', presence: 'absent', exactQuote: null },
        ],
      }),
    );

    expect(view.construct('deposit_refund_timeline')).toBe('absent');
    expect(demoted).toHaveLength(0);
  });

  it('reports an unasserted construct as unclear rather than absent', () => {
    const { view } = buildFactView(DOCUMENT, facts({}));
    expect(view.construct('jurisdiction_clause')).toBe('unclear');
  });
});
