import type { GroundingStats, RejectedFinding } from '@/core/grounding/verify';
import type { NextStep } from '@/core/remedies/types';
import { LABOUR_CONCILIATION, LEGAL_SERVICES_AUTHORITY } from './forums';
import { OFFER_LETTER_CLAUSES } from './offer-letter-clauses';
import { OFFER_LETTER_RISK } from './offer-letter-drivers';
import { OFFER_LETTER_TEXT } from './offer-letter-text';
import type { DemoReport } from './types';

/**
 * The hero document: an offer letter with a void non-compete, a bond that does not
 * reduce, a six-month contractual limitation period and an arbitrator the employer
 * alone appoints. Every one of those is a real pattern in Indian employment letters,
 * and the first is the single most useful thing this product can tell anyone.
 */

/**
 * One finding did not survive verification, and it is reported rather than dropped.
 *
 * This is the honest end of grounding. A model proposed a relocation allowance that is
 * not in the letter; the verifier could not find the quote, so the finding scored
 * nothing and is shown here under its own heading. Hiding it would make the failure
 * rate invisible, and an invisible failure rate is what lets a hallucination pass for
 * a citation.
 */
const REJECTED: readonly RejectedFinding[] = [
  {
    finding: {
      id: 'f8',
      category: 'payment',
      exactQuote:
        'The Company shall reimburse relocation expenses of up to Rupees Fifty Thousand (Rs. 50,000) on production of receipts.',
      clauseLabel: '3.4',
      plainSummary: 'The Company pays up to Rs 50,000 of your relocation costs against receipts.',
      obligationOn: 'counterparty',
      benefits: 'you',
      isUnusual: false,
    },
    reason: 'not_found',
  },
];

const GROUNDING: GroundingStats = {
  total: 8,
  grounded: 7,
  exact: 7,
  normalised: 0,
  fuzzy: 0,
  rejected: 1,
  rejectionsByReason: {
    quote_empty: 0,
    quote_too_short: 0,
    not_found: 1,
    below_threshold: 0,
    ambiguous: 0,
    duplicate: 0,
  },
};

const NEXT_STEPS: readonly NextStep[] = [
  {
    forum: LABOUR_CONCILIATION,
    limitationRule: null,
    // Null because the reader has not said anything went wrong yet. Inventing a start
    // date would produce a deadline someone might rely on.
    clock: null,
    signals: [
      { kind: 'risk_driver', detail: 'IN-ASYM-NOTICE-PERIOD' },
      { kind: 'verdict', detail: 'capped_by_statute' },
    ],
    priority: 80,
  },
  {
    forum: LEGAL_SERVICES_AUTHORITY,
    limitationRule: null,
    clock: null,
    signals: [{ kind: 'universal', detail: 'legal_services_authority' }],
    priority: 40,
  },
];

export const OFFER_LETTER_REPORT: DemoReport = {
  id: 'offer-letter-meridian',
  title: 'Letter of Appointment — Software Engineer II',
  documentType: 'employment_offer',
  blurb:
    'A 24-month non-compete, a Rs 2,00,000 bond that never reduces, and a clause that kills your claims after six months.',
  documentText: OFFER_LETTER_TEXT,
  clauses: OFFER_LETTER_CLAUSES,
  risk: OFFER_LETTER_RISK,
  grounding: GROUNDING,
  rejected: REJECTED,
  nextSteps: NEXT_STEPS,
  timeSensitive: false,
};
