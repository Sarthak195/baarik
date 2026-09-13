import type { ClauseView } from '@/lib/clause-view';
import { buildClause } from './build-clause';
import { ASYMMETRIC_NOTICE, SERVICE_BOND_THRESHOLD } from './offer-letter-drivers';
import { SERVICE_BOND } from './offer-letter-law';
import { OFFER_LETTER_TEXT as TEXT } from './offer-letter-text';

/**
 * The commercial terms: what you are paid, how you leave, and what leaving costs.
 *
 * These are the clauses a reader would recognise from the letter itself. The
 * restraints that follow in `offer-letter-restraints.ts` are the ones they would not
 * think to look for, which is why the two groups are authored separately.
 */

const pay = buildClause(TEXT, {
  finding: {
    id: 'f1',
    category: 'payment',
    exactQuote:
      'Your annual cost to company shall be Rupees Twelve Lakh (Rs. 12,00,000) per annum (Rs. 1,00,000 per month), payable monthly in arrears',
    clauseLabel: '3.1',
    plainSummary:
      'Your pay is fixed at Rs 12,00,000 a year, paid every month after tax is taken off.',
    obligationOn: 'counterparty',
    benefits: 'you',
    isUnusual: false,
  },
  page: 1,
  whyItMatters:
    'This is the only number in the letter you can rely on. Increments and bonuses are discretionary under clause 3.2, so Rs 12,00,000 is what you are agreeing to for the whole of the twenty-four-month bond period at clause 6.2.',
  favours: {
    side: 'you',
    yourShare: 2,
    pairedRights: 2,
    steps: [
      'The figure is stated as a fixed annual amount and a fixed monthly amount.',
      'Nothing in the letter lets the Company reduce it during the term, and nothing makes it conditional on performance.',
      'Both paired rights attached to pay land on your side.',
    ],
  },
  actions: [{ kind: 'accept', label: 'Nothing to raise here.', replacementText: null }],
});

const notice = buildClause(TEXT, {
  finding: {
    id: 'f2',
    category: 'termination',
    exactQuote:
      'If you wish to resign from the services of the Company, you shall give the Company prior written notice of ninety (90) days.',
    clauseLabel: '5.1',
    plainSummary:
      'You must tell the Company three months before you leave. It only has to give you one month.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 1,
  driver: ASYMMETRIC_NOTICE,
  confidenceOverride: 'depends_on_your_state',
  whyItMatters:
    'If you are offered a job that needs you in four weeks, you are three months away from being able to take it — and clause 5.3 lets the Company put you on garden leave for those three months without paying you.',
  favours: {
    side: 'counterparty',
    yourShare: 2,
    pairedRights: 9,
    steps: [
      'Notice to resign: 90 days (clause 5.1). Notice to terminate: 30 days (clause 5.2). Ratio 3 : 1 against you.',
      'Garden leave during the notice period is unpaid for you (clause 5.3). No matching obligation runs the other way.',
      'Your notice starts when the Company acknowledges it in writing (clause 5.4), so the Company controls the start date as well as the length.',
      '2 of the 9 paired rights compared across this letter land on your side.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for the notice period to be the same on both sides.',
      replacementText:
        'Either party may end this employment by giving the other sixty (60) days’ prior written notice, or payment of basic salary in lieu of the unserved part of that notice. Notice shall run from the date the notice is delivered.',
    },
    {
      kind: 'walk_away',
      label: 'If the Company will not move on this, it is worth knowing before you sign.',
      replacementText: null,
    },
  ],
});

const bond = buildClause(TEXT, {
  finding: {
    id: 'f3',
    category: 'penalty',
    exactQuote:
      'you shall pay the Company Rupees Two Lakh (Rs. 2,00,000) as agreed and liquidated damages and not as a penalty',
    clauseLabel: '6.3',
    plainSummary:
      'Leave before twenty-four months and the letter says you owe Rs 2,00,000, however long you actually stayed.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 2,
  driver: SERVICE_BOND_THRESHOLD,
  law: SERVICE_BOND,
  whyItMatters:
    'If you resign in month 7 of 24, the letter still claims the whole Rs 2,00,000 — one sixth of your annual pay — and says it may be taken out of your full and final settlement.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 3,
    steps: [
      'The bond binds you for 24 months. No matching commitment binds the Company for any period.',
      'The sum does not reduce with service: month 2 and month 23 carry the same Rs 2,00,000.',
      'The letter does not state what the training cost, so there is nothing to compare the figure against.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for the bond to reduce month by month, and for the training cost to be stated.',
      replacementText:
        'The amount payable under this clause shall reduce proportionately for each completed month of service, and shall not exceed the documented cost of the training actually provided.',
    },
  ],
});

export const OFFER_LETTER_TERMS: readonly ClauseView[] = [pay, notice, bond];
