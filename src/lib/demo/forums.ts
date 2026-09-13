import { computeLimitation, type LimitationClock } from '@/core/remedies/limitation';
import type { ForumRoute, ForumTrigger, RemedyLimitationRule } from '@/core/remedies/types';

/**
 * Three forum rows, transcribed from `data/remedies/forums.yaml`.
 *
 * The point of this panel is that India has a dense, cheap and largely unknown set of
 * statutory forums, and almost nobody holding a one-sided contract knows any of them.
 * A consumer complaint is free up to Rs 5,00,000 and may be filed where the
 * complainant lives — CPA 2019 s.34(2)(d), which quietly overrides the exclusive
 * jurisdiction clause the contract chose. None of that is inferred by a model.
 */

const NO_TRIGGERS: ForumTrigger = {
  documentTypes: [],
  problems: [],
  constructs: [],
  verdicts: [],
  driverSeverities: [],
  situations: [],
  universal: false,
};

export const LABOUR_CONCILIATION: ForumRoute = {
  id: 'labour_conciliation',
  name: 'Conciliation Officer or Labour Commissioner, then the Labour Court',
  handles:
    'Unpaid or delayed wages, illegal termination, retrenchment, gratuity and provident fund.',
  statute:
    'Code on Wages, 2019, s.17; Industrial Relations Code, 2020; Industrial Disputes Act, 1947, s.2A',
  statuteUrl: 'https://www.indiacode.nic.in/',
  portal: {
    name: "SAMADHAN, the Ministry of Labour and Employment's dispute portal",
    url: 'https://samadhan.labour.gov.in/',
  },
  helpline: null,
  fee: {
    summary: 'Free. Raising a dispute and the conciliation that follows cost nothing.',
    amountInr: 0,
    freeForClaimsUpToInr: null,
  },
  filingPlace:
    'With the Conciliation Officer or Labour Commissioner having jurisdiction over the establishment. SAMADHAN routes the complaint to the right office.',
  lawyerRequired: false,
  prerequisites: [
    {
      step: 'Raise the dispute before the Conciliation Officer first. s.2A(2) allows a direct application to the Labour Court only after this.',
      waitDays: 45,
      url: null,
    },
  ],
  entitlements: [
    'Code on Wages, 2019, s.17(2) — where an employee is removed, dismissed, retrenched or resigns, the wages payable must be paid within two working days.',
    "Industrial Disputes Act, 1947, s.25F — retrenchment without one month's notice or notice pay, and without retrenchment compensation, is invalid.",
  ],
  limitationRuleId: 'id-act-1947-s2a3',
  triggers: { ...NO_TRIGGERS, documentTypes: ['employment_offer'] },
  caveats: [
    'The four Labour Codes were brought into force on 21 November 2025, so confirm which provision governs your dates before relying on the period shown.',
    'The conciliation route is open to a workman as defined in s.2(s) of the 1947 Act and the corresponding definition in the Code. Mainly supervisory or managerial work above the wage threshold falls outside it.',
    'Gratuity is claimed separately, from the Controlling Authority.',
  ],
};

export const CONSUMER_COMMISSION: ForumRoute = {
  id: 'consumer_commission',
  name: 'District Consumer Disputes Redressal Commission',
  handles:
    'Defective goods, deficient services and unfair contract terms, against a seller or service provider.',
  statute: 'Consumer Protection Act, 2019, ss.34, 35 and 69',
  statuteUrl: 'https://www.indiacode.nic.in/',
  portal: { name: 'e-Daakhil', url: 'https://edaakhil.nic.in/' },
  helpline: '1915 — National Consumer Helpline',
  fee: {
    summary:
      'Nothing is payable on a claim up to Rs 5,00,000. Above that the fee is slabbed and remains small.',
    amountInr: null,
    freeForClaimsUpToInr: 500000,
  },
  filingPlace:
    'CPA 2019 s.34(2)(d) lets you file where you live or work, whatever the agreement says about exclusive jurisdiction.',
  lawyerRequired: false,
  prerequisites: [],
  entitlements: [
    's.39 — the Commission may order the deficiency removed, the amount paid refunded, and compensation for loss or injury.',
    's.2(46) lists an unfair contract term, including a manifestly excessive security deposit, as something the Commission may declare void.',
  ],
  limitationRuleId: 'cpa-2019-s69',
  triggers: { ...NO_TRIGGERS, documentTypes: ['rent_agreement'] },
  caveats: [
    'Whether you are a consumer for this Act, and whether the other side supplied a service, are questions of fact the Commission decides.',
    'An arbitration clause in the agreement does not bar this route, but the other side may still try to start arbitration.',
  ],
};

export const LEGAL_SERVICES_AUTHORITY: ForumRoute = {
  id: 'legal_services_authority',
  name: 'District or State Legal Services Authority',
  handles:
    'Free legal advice, drafting and representation by a panel advocate for anyone within s.12 of the Legal Services Authorities Act, 1987.',
  statute: 'Legal Services Authorities Act, 1987, ss.12 and 13',
  statuteUrl: 'https://www.indiacode.nic.in/',
  portal: { name: 'NALSA', url: 'https://nalsa.gov.in/' },
  helpline: '15100 — NALSA legal services helpline',
  fee: {
    summary:
      'Free, including court fees, process fees and the panel advocate, for anyone eligible under s.12.',
    amountInr: 0,
    freeForClaimsUpToInr: null,
  },
  filingPlace:
    'At the District Legal Services Authority in your district court complex, which accepts walk-in applications, or online through the NALSA portal.',
  lawyerRequired: false,
  prerequisites: [],
  entitlements: [
    's.12(c) and s.12(f) entitle every woman, every child and every industrial workman to free legal services irrespective of what they earn.',
    'Tele-Law connects you to a panel lawyer free of charge through a Common Service Centre or the Tele-Law app, offered in 22 languages.',
  ],
  limitationRuleId: null,
  triggers: { ...NO_TRIGGERS, universal: true },
  caveats: [
    'Eligibility is decided by the Authority on the application and the documents filed with it.',
    'Applying for free legal aid does not stop the limitation period for the underlying claim from running.',
  ],
};

export const CPA_LIMITATION: RemedyLimitationRule = {
  id: 'cpa-2019-s69',
  causeOfAction:
    'The date on which the cause of action arose — the defect, the deficiency in service or the unfair trade practice — not the date the agreement was signed.',
  period: { unit: 'months', count: 24 },
  statute: 'Consumer Protection Act, 2019, s.69',
  statuteUrl: 'https://www.indiacode.nic.in/',
  condonationPossible: true,
  stages: [
    {
      label:
        'Appeal to the State Commission against a District Commission order, after depositing 50% of the amount ordered',
      days: 45,
      from: "the date of the District Commission's order",
      statute: 'Consumer Protection Act, 2019, s.41',
    },
  ],
};

/**
 * A fixed reference date, not the ambient clock.
 *
 * A demonstration report whose countdown changes every time the page is rendered
 * cannot be checked against a screenshot, and reading the clock during render would
 * also make this page impossible to prerender. The real pipeline passes the request's
 * own `today` into `computeLimitation`; this passes a constant into the same function.
 */
export const DEMO_TODAY = new Date('2026-09-13T00:00:00Z');

export const RENT_DEPOSIT_CLOCK: LimitationClock = computeLimitation(
  {
    id: CPA_LIMITATION.id,
    causeOfAction: CPA_LIMITATION.causeOfAction,
    periodMonths: CPA_LIMITATION.period.count,
    statute: CPA_LIMITATION.statute,
    statuteUrl: CPA_LIMITATION.statuteUrl,
    condonationPossible: CPA_LIMITATION.condonationPossible,
  },
  new Date('2024-10-02T00:00:00Z'),
  DEMO_TODAY,
);
