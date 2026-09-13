import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import type { RiskDriver } from '@/core/risk/types';
import type { ClauseView } from '@/lib/clause-view';
import { buildClause } from './build-clause';
import { locate } from './ground';
import { RENT_AGREEMENT_TEXT as TEXT } from './rent-agreement-text';

/**
 * The three clauses that make this agreement worth reading, and the statute row that
 * caps the worst of them.
 *
 * A deposit of ten months' rent is not a Bengaluru eccentricity — it is the ordinary
 * ask in several Indian cities, and it is the largest sum most tenants will ever hand
 * to a stranger without a date for its return.
 */

const FORFEITURE: EnforceabilityVerdict = {
  construct: 'forfeiture_of_paid_amounts',
  verdict: 'capped_by_statute',
  confidence: 'high',
  statute: {
    act: 'Indian Contract Act, 1872',
    section: 'Section 74 — Compensation for breach of contract where penalty stipulated for',
    text: 'When a contract has been broken, if a sum is named in the contract as the amount to be paid in case of such breach, or if the contract contains any other stipulation by way of penalty, the party complaining of the breach is entitled, whether or not actual damage or loss is proved to have been caused thereby, to receive from the party who has broken the contract reasonable compensation not exceeding the amount so named.',
    url: 'https://www.indiacode.nic.in/show-data?actid=AC_CEN_3_20_00035_187209_1523268996428&orderno=75',
  },
  authorities: [
    {
      cite: 'Kailash Nath Associates v Delhi Development Authority, (2015) 4 SCC 136 (9 January 2015)',
      holding:
        'Section 74 awards reasonable compensation for loss caused by the breach; damage or loss is a sine qua non, and where no loss is shown the named sum is not recoverable merely because it was named.',
      url: 'https://indiankanoon.org/doc/70828540/',
    },
  ],
  plainMeaning:
    'A clause that forfeits everything you have deposited sets a ceiling rather than an amount. What the other side can keep is what it can show it actually lost.',
  caveats: [
    'This states the rule in the section. What a court would allow on your facts depends on evidence it has not yet seen.',
    'A deposit genuinely held against damage to the premises is treated differently from one forfeited as a penalty for leaving early.',
    'Rent control and tenancy law differ by State, and Karnataka, Maharashtra and Delhi do not treat leave-and-licence agreements alike.',
  ],
  appliesTo: ['rent_agreement'],
  evidence: locate(TEXT, 'the entire security deposit shall stand forfeited to the Licensor'),
};

const DEPOSIT_MULTIPLE: RiskDriver = {
  ruleId: 'IN-THRESH-DEPOSIT-MULTIPLE',
  tier: 'threshold',
  severity: 'critical',
  title: 'The deposit is ten months of rent',
  explain:
    'The deposit is Rs 3,00,000 against a monthly licence fee of Rs 30,000 — a multiple of 10. The rubric treats anything above 3 as high, and the Consumer Protection Act, 2019 lists a manifestly excessive security deposit as an unfair contract term.',
  points: 20,
  evidence: locate(TEXT, 'interest-free refundable security deposit of Rupees Three Lakh'),
  askYourLawyer:
    'Will the Licensor bring the deposit down to three months, and pay interest on what is held?',
};

const LOCK_IN_FORFEITURE: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-FORFEITURE',
  tier: 'construct',
  severity: 'critical',
  title: 'Leaving early forfeits the whole deposit',
  explain:
    'Clause 3.1 forfeits all Rs 3,00,000 if you vacate before month 11 — for any reason, including a transfer, a job loss or the premises becoming unfit.',
  points: 18,
  evidence: locate(TEXT, 'the entire security deposit shall stand forfeited to the Licensor'),
  askYourLawyer: 'Can the forfeiture be limited to the rent for the unexpired notice period?',
};

const ENTRY_AT_ANY_TIME: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-SELF-HELP-ENTRY',
  tier: 'construct',
  severity: 'high',
  title: 'The Licensor may enter at any time',
  explain:
    'Clause 4.1 allows entry at any time, for any purpose the Licensor considers necessary, with no notice requirement anywhere in the agreement.',
  points: 12,
  evidence: locate(TEXT, 'may enter the premises at any time for inspection'),
  askYourLawyer: 'Will the Licensor agree to 24 hours of written notice except in an emergency?',
};

const NO_REFUND_TIMELINE: RiskDriver = {
  ruleId: 'IN-ABSENCE-DEPOSIT-TIMELINE',
  tier: 'absence',
  severity: 'high',
  title: 'The agreement never says when the deposit comes back',
  explain:
    'Clause 2.3 makes the refund conditional on the Licensor satisfying himself, and names no number of days. There is no date by which Rs 3,00,000 must be returned to you.',
  points: 10,
  evidence: null,
  askYourLawyer:
    'Will the agreement state a fixed number of days for the refund, and interest if it is late?',
};

const deposit = buildClause(TEXT, {
  finding: {
    id: 'f1',
    category: 'deposit',
    exactQuote:
      'deposit with the Licensor an interest-free refundable security deposit of Rupees Three Lakh (Rs. 3,00,000)',
    clauseLabel: '2.2',
    plainSummary: 'You hand over Rs 3,00,000 — ten months of rent — and it earns you nothing.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 1,
  driver: DEPOSIT_MULTIPLE,
  confidenceOverride: 'depends_on_your_state',
  whyItMatters:
    'Ten months of rent sits with the Licensor for the whole term, interest-free, and clause 3.1 says you lose all of it if you leave early. Rs 3,00,000 is a deposit most people borrow to pay.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 4,
    steps: [
      'Deposit Rs 3,00,000 against rent Rs 30,000 per month — a multiple of 10.',
      'The deposit is interest-free, so the Licensor holds the money and keeps the return on it.',
      'No paired obligation: nothing is held by you against the Licensor’s performance.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for three months, refundable within a stated number of days.',
      replacementText:
        'The Licensee shall deposit a refundable security deposit equal to three (3) months’ licence fee, refundable within fifteen (15) days of handover, less only amounts actually due and evidenced.',
    },
  ],
});

const lockIn = buildClause(TEXT, {
  finding: {
    id: 'f2',
    category: 'lock_in',
    exactQuote:
      'If the Licensee vacates earlier for any reason, the entire security deposit shall stand forfeited to the Licensor.',
    clauseLabel: '3.1',
    plainSummary: 'Leave before eleven months are up and you lose the whole Rs 3,00,000.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 1,
  driver: LOCK_IN_FORFEITURE,
  law: FORFEITURE,
  whyItMatters:
    'A transfer out of Bengaluru in month 4 costs you Rs 3,00,000 under this wording, whatever the Licensor actually loses by re-letting a flat in Koramangala.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 2,
    steps: [
      'The lock-in binds you for 11 months. Nothing binds the Licensor for any period.',
      'Forfeiture is total and does not scale with how much of the term was left.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for a two-month notice exit instead of forfeiture.',
      replacementText:
        'Either party may terminate this agreement on two (2) months’ written notice. On such termination the security deposit shall be refunded in full, less rent for any unserved part of the notice period.',
    },
  ],
});

const entry = buildClause(TEXT, {
  finding: {
    id: 'f3',
    category: 'other',
    exactQuote:
      'The Licensor or his authorised representative may enter the premises at any time for inspection, repairs or any other purpose the Licensor considers necessary.',
    clauseLabel: '4.1',
    plainSummary: 'The Licensor can let himself in whenever he likes, for any reason.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
  },
  page: 2,
  driver: ENTRY_AT_ANY_TIME,
  whyItMatters:
    'There is no notice period and no limit on the purpose, so the clause covers a visit at 10 p.m. on a Sunday as readily as an annual inspection.',
  favours: {
    side: 'counterparty',
    yourShare: 0,
    pairedRights: 2,
    steps: [
      'Entry: unrestricted for the Licensor, with no notice obligation.',
      'Repairs: clause 4.2 puts every repair, structural included, on you.',
    ],
  },
  actions: [
    {
      kind: 'ask',
      label: 'Ask for notice before entry.',
      replacementText:
        'The Licensor may enter the premises on twenty-four (24) hours’ prior written notice, at a reasonable hour, except where entry is needed to prevent imminent damage.',
    },
  ],
});

export const RENT_CLAUSES: readonly ClauseView[] = [deposit, lockIn, entry];

export const RENT_DRIVERS: readonly RiskDriver[] = [
  DEPOSIT_MULTIPLE,
  LOCK_IN_FORFEITURE,
  ENTRY_AT_ANY_TIME,
  NO_REFUND_TIMELINE,
];

/** The three the summary leads with, in the order the rubric ranked them. */
export const RENT_TOP_DRIVERS: readonly RiskDriver[] = [
  DEPOSIT_MULTIPLE,
  LOCK_IN_FORFEITURE,
  ENTRY_AT_ANY_TIME,
];

export const RENT_FORFEITURE_ROW: EnforceabilityVerdict = FORFEITURE;
