import type { ClauseView } from '@/lib/clause-view';
import { buildClause } from './build-clause';
import {
  IP_REACH,
  NON_COMPETE_CONSTRUCT,
  SHORT_LIMITATION_CONSTRUCT,
  UNILATERAL_ARBITRATOR,
} from './offer-letter-drivers';
import { NON_COMPETE, SHORT_LIMITATION, SOLE_ARBITRATOR } from './offer-letter-law';
import { OFFER_LETTER_TEXT as TEXT } from './offer-letter-text';

/**
 * What the letter takes rather than what it gives: the restraint on working, the
 * assignment of everything you make, the arbitrator one side picks, and the clause
 * that quietly shortens the life of every claim you might ever have.
 *
 * Three of the four carry a statute row. The fourth deliberately does not, so the card
 * has to say so rather than implying the clause is sound because nothing was found.
 */

const nonCompete = buildClause(TEXT, {
  finding: {
    id: 'f4',
    category: 'restraint_of_trade',
    exactQuote:
      'For a period of twenty-four (24) months after the cessation of your employment, for any reason whatsoever, you shall not directly or indirectly join, be employed by, advise, consult for, or hold any interest in any competing business in the territory of India.',
    clauseLabel: '7.1',
    plainSummary:
      'For two years after you leave, this says you may not work for any software business anywhere in India.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 2,
  driver: NON_COMPETE_CONSTRUCT,
  law: NON_COMPETE,
  whyItMatters:
    'Read literally, this covers every employer you are qualified to work for. Section 27 of the Indian Contract Act voids agreements in restraint of trade, and India has no reasonableness test that saves a post-employment restraint — which is why the same clause would be argued very differently in London or California.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 2,
    steps: [
      'The restraint runs one way: 24 months on you, nothing on the Company.',
      'No compensation is paid for the restricted period; clause 7.3 asserts your salary already covers it.',
      'Neither paired right lands on your side.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for clause 7.1 to be dropped and the confidentiality clause relied on instead.',
      replacementText:
        'Clause 7.1 is deleted. The Employee’s obligations of confidentiality at Clause 9 and of non-solicitation at Clause 8 shall continue to apply after the employment ends.',
    },
  ],
});

const ip = buildClause(TEXT, {
  finding: {
    id: 'f5',
    category: 'ip_assignment',
    exactQuote:
      "whether or not during working hours, whether or not using the Company's equipment, and whether or not related to the business of the Company",
    clauseLabel: '10.1',
    plainSummary:
      'Anything you create while employed belongs to the Company — including work done on your own time, on your own laptop, on something unrelated to your job.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 3,
  driver: IP_REACH,
  whyItMatters:
    'A side project, an open-source library or a weekend app built on your own machine falls inside this wording, and clause 10.2 requires you to disclose every one of them.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 2,
    steps: [
      'The assignment covers all time, all equipment and all subject matter, with no carve-out for work you already own.',
      'The Company gives nothing in return: clause 10.2 requires the paperwork "without further consideration".',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for a carve-out and a schedule of what you already own.',
      replacementText:
        'This clause applies only to work created in the course of your duties, or using the Company’s premises, equipment or confidential information. Work listed in Schedule A remains yours.',
    },
  ],
});

const arbitration = buildClause(TEXT, {
  finding: {
    id: 'f6',
    category: 'dispute_resolution',
    exactQuote:
      'Any dispute arising out of or in connection with your employment shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, before a sole arbitrator appointed by the Managing Director of the Company.',
    clauseLabel: '11.1',
    plainSummary:
      'Any dispute goes to a private arbitrator, and the Company’s Managing Director picks that arbitrator.',
    obligationOn: 'both',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 3,
  driver: UNILATERAL_ARBITRATOR,
  law: SOLE_ARBITRATOR,
  whyItMatters:
    'The person deciding whether the Company owes you your settlement would be chosen by the Company, and clause 11.2 puts the arbitrator’s fees on whoever raises the dispute — which is you.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 3,
    steps: [
      'Appointment: one side chooses. Seat: fixed at the Company’s city.',
      'Costs fall on the party raising the dispute irrespective of who wins (clause 11.2).',
      'None of the three paired rights in this clause lands on your side.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for an institutional appointment and for costs to follow the outcome.',
      replacementText:
        'The sole arbitrator shall be appointed by an arbitral institution agreed between the parties. The costs of the arbitration shall be borne as the arbitrator directs.',
    },
  ],
});

const limitation = buildClause(TEXT, {
  finding: {
    id: 'f7',
    category: 'dispute_resolution',
    exactQuote:
      'No claim, demand or proceeding arising out of or relating to your employment shall be entertained, and every right in respect of such claim shall stand extinguished, unless the claim is raised in writing within six (6) months of the date on which the cause of action first arose.',
    clauseLabel: '11.3',
    plainSummary:
      'This says any claim you have against the Company dies six months after it arises.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 3,
  driver: SHORT_LIMITATION_CONSTRUCT,
  law: SHORT_LIMITATION,
  whyItMatters:
    'Unpaid dues are often discovered long after you leave. Six months against the three years the Limitation Act, 1963 ordinarily allows is the difference between a claim you can bring and one you cannot.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 1,
    steps: [
      'The six-month window is written to apply to claims arising out of your employment; in practice those are your claims.',
      'The Company’s own right to recover the bond at clause 6.3 is expressed as a debt and is not limited in the same way.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for clause 11.3 to be deleted.',
      replacementText:
        'Clause 11.3 is deleted. The periods prescribed by the Limitation Act, 1963 shall apply.',
    },
  ],
});

export const OFFER_LETTER_RESTRAINTS: readonly ClauseView[] = [
  nonCompete,
  ip,
  arbitration,
  limitation,
];
