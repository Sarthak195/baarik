import type { RiskDriver, RiskReport, UnknownFact } from '@/core/risk/types';
import { locate } from './ground';
import { OFFER_LETTER_TEXT as TEXT } from './offer-letter-text';

/**
 * What the rubric would have said about this document.
 *
 * Each driver carries the arithmetic that made it fire, rendered against this
 * document's own figures — 90 days against 30, Rs 2,00,000 against Rs 12,00,000 — which
 * is what separates an auditable score from an assertion. `askYourLawyer` is phrased as
 * a question to put, never as a step to take: ADR 0005.
 */

export const ASYMMETRIC_NOTICE: RiskDriver = {
  ruleId: 'IN-ASYM-NOTICE-PERIOD',
  tier: 'asymmetry',
  severity: 'high',
  title: 'Notice runs three times longer against you',
  explain:
    'You must give 90 days of notice to resign. The Company must give 30 to end your employment. That is a ratio of 3 : 1 against you, and the clause that makes your notice start only when the Company acknowledges it puts the start date in the Company’s hands as well.',
  points: 14,
  evidence: locate(TEXT, 'prior written notice of ninety (90) days'),
  askYourLawyer:
    'Can the notice period be made the same on both sides, and if not, what is the buy-out rate in rupees?',
};

export const SERVICE_BOND_THRESHOLD: RiskDriver = {
  ruleId: 'IN-THRESH-BOND-CTC',
  tier: 'threshold',
  severity: 'high',
  title: 'The bond does not reduce as you serve it',
  explain:
    'The bond is Rs 2,00,000 against an annual cost to company of Rs 12,00,000 — one sixth of a year’s pay — and clause 6.3 makes it payable in full whether you leave in month 2 or month 23.',
  points: 12,
  evidence: locate(
    TEXT,
    'The said sum shall be payable in full irrespective of the service actually completed',
  ),
  askYourLawyer:
    'Will the Company reduce the bond month by month, and what did the training at clause 6.1 actually cost it?',
};

export const NON_COMPETE_CONSTRUCT: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-NONCOMPETE',
  tier: 'construct',
  severity: 'critical',
  title: 'Post-employment non-competition',
  explain:
    'The restraint runs for 24 months after the employment ends, covers the whole of India, and clause 7.2 defines a competing business to include every business supplying software or software services of any description.',
  points: 18,
  evidence: locate(TEXT, 'For a period of twenty-four (24) months after the cessation'),
  askYourLawyer:
    'Will the Company replace clause 7.1 with confidentiality and non-solicitation covenants instead?',
};

export const IP_REACH: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-IP-ALL-HOURS',
  tier: 'construct',
  severity: 'medium',
  title: 'The assignment reaches work done on your own time',
  explain:
    'Clause 10.1 assigns everything you create during the employment to the Company whether or not it was made in working hours, whether or not on the Company’s equipment, and whether or not it has anything to do with the Company’s business.',
  points: 8,
  evidence: locate(TEXT, 'whether or not related to the business of the Company'),
  askYourLawyer:
    'Can clause 10.1 be limited to work connected with the Company’s business, and can a schedule list what you already own?',
};

export const SHORT_LIMITATION_CONSTRUCT: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-LIMITATION',
  tier: 'construct',
  severity: 'critical',
  title: 'Your claims are made to expire in six months',
  explain:
    'Clause 11.3 says every right of yours is extinguished unless raised in writing within six months, against the three years the Limitation Act, 1963 ordinarily allows for a claim on a contract.',
  points: 16,
  evidence: locate(
    TEXT,
    'within six (6) months of the date on which the cause of action first arose',
  ),
  askYourLawyer: 'Why is this clause in the letter at all, given section 28(b)?',
};

export const UNILATERAL_ARBITRATOR: RiskDriver = {
  ruleId: 'IN-CONSTRUCT-UNILATERAL-ARB',
  tier: 'construct',
  severity: 'high',
  title: 'Only the Company chooses the arbitrator',
  explain:
    'The sole arbitrator is appointed by the Managing Director of the Company, and clause 11.2 puts the arbitrator’s fees on whoever raises the dispute, irrespective of the outcome.',
  points: 14,
  evidence: locate(TEXT, 'a sole arbitrator appointed by the Managing Director of the Company'),
  askYourLawyer: 'Will the Company agree to an arbitrator appointed by an institution instead?',
};

export const NO_TERMINATION_GROUNDS: RiskDriver = {
  ruleId: 'IN-ABSENCE-EMPLOYER-CAUSE',
  tier: 'absence',
  severity: 'medium',
  title: 'The letter never says on what grounds the Company may end your employment',
  explain:
    'Clause 5.2 gives the Company 30 days of notice and no stated reason. Nothing in the letter limits when it may be used.',
  points: 5,
  evidence: null,
  askYourLawyer: 'Can the letter list the grounds on which the Company may terminate?',
};

export const NO_RELIEVING_LETTER: RiskDriver = {
  ruleId: 'IN-ABSENCE-RELIEVING-LETTER',
  tier: 'absence',
  severity: 'medium',
  title: 'No commitment to issue a relieving letter',
  explain:
    'The letter says nothing about the relieving letter or experience certificate your next employer will ask for, while clause 6.3 lets this employer treat the bond as a debt recoverable from your settlement.',
  points: 4,
  evidence: null,
  askYourLawyer:
    'Will the Company commit in writing to issue a relieving letter on the last working day?',
};

export const OFFER_LETTER_DRIVERS: readonly RiskDriver[] = [
  NON_COMPETE_CONSTRUCT,
  SHORT_LIMITATION_CONSTRUCT,
  ASYMMETRIC_NOTICE,
  UNILATERAL_ARBITRATOR,
  SERVICE_BOND_THRESHOLD,
  IP_REACH,
  NO_TERMINATION_GROUNDS,
  NO_RELIEVING_LETTER,
];

/**
 * An unknown is a question, never a silent zero. A fact the extractor could not settle
 * propagates through the rubric as `unknown` and arrives here as something to ask —
 * which is the productive end of three-valued logic (ADR 0004).
 */
const OFFER_LETTER_UNKNOWNS: readonly UnknownFact[] = [
  {
    ruleId: 'IN-ABSENCE-NOTICE-BUYOUT',
    missing: ['noticeBuyoutRateInr'],
    question:
      'If you want to leave before 90 days are up, what will the Company charge you to buy out the rest of the notice period? The letter does not say.',
  },
  {
    ruleId: 'IN-ABSENCE-ESOP-EXIT',
    missing: ['esopVestingSchedule', 'esopExerciseWindowDays'],
    question:
      'What happens to options already granted to you if you resign during the bond period? Clause 3.3 defers this to a Plan you have not been shown.',
  },
  {
    ruleId: 'IN-THRESH-TRAINING-COST',
    missing: ['bondTrainingCostInr'],
    question:
      'What did the training at clause 6.1 actually cost the Company? Under section 74 it is that figure, not the Rs 2,00,000, that a court would be looking for.',
  },
];

/** Points sum to 91; the engine saturates rather than running past 100. */
export const OFFER_LETTER_RISK: RiskReport = {
  score: 78,
  band: 'high',
  drivers: OFFER_LETTER_DRIVERS,
  topDrivers: [NON_COMPETE_CONSTRUCT, SHORT_LIMITATION_CONSTRUCT, ASYMMETRIC_NOTICE],
  unknowns: OFFER_LETTER_UNKNOWNS,
  tierTotals: { asymmetry: 14, threshold: 12, construct: 56, absence: 9 },
  rubricVersion: '2026.09.13',
};
