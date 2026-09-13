import type { GroundingStats } from '@/core/grounding/verify';
import type { NextStep } from '@/core/remedies/types';
import type { RiskReport } from '@/core/risk/types';
import {
  CONSUMER_COMMISSION,
  CPA_LIMITATION,
  LEGAL_SERVICES_AUTHORITY,
  RENT_DEPOSIT_CLOCK,
} from './forums';
import { RENT_CLAUSES, RENT_DRIVERS, RENT_TOP_DRIVERS } from './rent-agreement-clauses';
import { RENT_AGREEMENT_TEXT as TEXT } from './rent-agreement-text';
import type { ReportView } from './types';

/**
 * The second demonstration document, and the one that carries a live deadline.
 *
 * Its consumer limitation clock has nineteen days left, which is what makes it the
 * report that opens on the hard interrupt rather than on the findings — the one case
 * where stopping the reader is more useful than informing them.
 */

const RISK: RiskReport = {
  score: 84,
  band: 'severe',
  drivers: RENT_DRIVERS,
  topDrivers: RENT_TOP_DRIVERS,
  unknowns: [
    {
      ruleId: 'IN-ABSENCE-MAINTENANCE-SPLIT',
      missing: ['maintenanceMonthlyInr'],
      question:
        'Who pays the society maintenance, and how much is it? The agreement does not say, and clause 4.2 puts every other cost on you.',
    },
  ],
  tierTotals: { asymmetry: 0, threshold: 20, construct: 30, absence: 10 },
  rubricVersion: '2026.09.13',
};

const GROUNDING: GroundingStats = {
  total: 4,
  grounded: 3,
  exact: 2,
  normalised: 1,
  fuzzy: 0,
  rejected: 1,
  rejectionsByReason: {
    quote_empty: 0,
    quote_too_short: 1,
    not_found: 0,
    below_threshold: 0,
    ambiguous: 0,
    duplicate: 0,
  },
};

const NEXT_STEPS: readonly NextStep[] = [
  {
    forum: CONSUMER_COMMISSION,
    limitationRule: CPA_LIMITATION,
    clock: RENT_DEPOSIT_CLOCK,
    signals: [
      { kind: 'risk_driver', detail: 'IN-THRESH-DEPOSIT-MULTIPLE' },
      { kind: 'verdict', detail: 'capped_by_statute' },
    ],
    priority: 90,
  },
  {
    forum: LEGAL_SERVICES_AUTHORITY,
    limitationRule: null,
    clock: null,
    signals: [{ kind: 'universal', detail: 'legal_services_authority' }],
    priority: 40,
  },
];

export const RENT_AGREEMENT_REPORT: ReportView = {
  id: 'rent-agreement-koramangala',
  title: 'Leave and Licence Agreement — Koramangala',
  documentType: 'rent_agreement',
  blurb:
    'A deposit of ten months’ rent, forfeited in full if you leave early, and no date by which it ever comes back.',
  documentText: TEXT,
  clauses: RENT_CLAUSES,
  risk: RISK,
  grounding: GROUNDING,
  rejected: [
    {
      finding: {
        id: 'f4',
        category: 'jurisdiction',
        exactQuote: 'courts at Bengaluru',
        clauseLabel: '6.1',
        plainSummary: 'Disputes go to the courts in Bengaluru.',
        obligationOn: 'both',
        benefits: 'counterparty',
        isUnusual: false,
      },
      reason: 'quote_too_short',
    },
  ],
  nextSteps: NEXT_STEPS,
  timeSensitive: true,
};
