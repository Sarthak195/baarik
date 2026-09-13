import { describe, expect, it } from 'vitest';

import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import { routeNextSteps } from '@/core/remedies/router';
import type {
  ForumTable,
  ForumTrigger,
  LimitationTable,
  NextStep,
  RemedyLimitationRule,
  RemedySituation,
} from '@/core/remedies/types';
import type { FactView, RiskDriver, Severity } from '@/core/risk/types';
import { fakeFacts } from '../../../fakes/fact-view';

const INDIA_CODE = 'https://www.indiacode.nic.in/';

/**
 * The fields the router never reads. Keeping them here lets each row below show only
 * what makes it different; the real wording lives in `data/remedies/forums.yaml`.
 */
const BASE = {
  name: 'The forum',
  handles: 'What this forum hears.',
  statuteUrl: INDIA_CODE,
  helpline: null,
  filingPlace: 'Where the statute says it may be filed.',
  lawyerRequired: false,
  prerequisites: [],
  fee: { summary: 'Free.', amountInr: 0, freeForClaimsUpToInr: null },
};

/** Mirrors the YAML, where a row omits the trigger keys it does not use. */
const triggersOf = (used: Partial<ForumTrigger>): ForumTrigger => ({
  documentTypes: [],
  problems: [],
  constructs: [],
  verdicts: [],
  driverSeverities: [],
  situations: [],
  universal: false,
  ...used,
});

/** Four rows transcribed from `data/remedies/forums.yaml` rather than invented. */
const FORUMS: ForumTable = [
  {
    ...BASE,
    id: 'consumer_commission',
    statute: 'Consumer Protection Act, 2019, ss.34, 35 and 69',
    portal: { name: 'e-Jagriti', url: 'https://e-jagriti.gov.in/' },
    fee: { summary: 'Nothing up to Rs 5,00,000.', amountInr: null, freeForClaimsUpToInr: 500_000 },
    filingPlace: 's.34(2)(d) — where you ordinarily reside or personally work for gain.',
    entitlements: ['s.39 lets the Commission order a refund, compensation or replacement.'],
    limitationRuleId: 'cpa-2019-s69',
    triggers: triggersOf({
      documentTypes: ['loan_agreement', 'privacy_policy', 'other'],
      problems: ['goods_or_services_defect', 'bank_or_loan_conduct'],
      constructs: ['forfeiture_of_paid_amounts'],
      verdicts: ['cannot_oust_this_forum'],
      driverSeverities: ['critical'],
    }),
    caveats: ['s.2(7) excludes anything obtained for resale or for a commercial purpose.'],
  },
  {
    ...BASE,
    id: 'msefc',
    statute: 'Micro, Small and Medium Enterprises Development Act, 2006, ss.15, 16 and 18',
    portal: { name: 'MSME Samadhaan', url: 'https://samadhaan.msme.gov.in/' },
    prerequisites: [
      { step: 'Register on Udyam.', waitDays: null, url: 'https://udyamregistration.gov.in/' },
    ],
    entitlements: ['s.16 — compound interest with monthly rests at three times the RBI bank rate.'],
    limitationRuleId: 'limitation-act-1963-art55',
    triggers: triggersOf({
      documentTypes: ['freelance_contract'],
      problems: ['unpaid_invoice'],
      constructs: ['sole_discretion_on_payment'],
      driverSeverities: ['critical'],
    }),
    caveats: ['The s.16 interest applies only to a registered micro or small enterprise.'],
  },
  {
    ...BASE,
    id: 'grievance_appellate_committee',
    statute: 'IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, rule 3A',
    statuteUrl: 'https://www.meity.gov.in/',
    portal: { name: 'GAC', url: 'https://gac.gov.in/' },
    prerequisites: [{ step: 'Complain to the Grievance Officer.', waitDays: 15, url: null }],
    entitlements: ['Rule 3A(3) — an appeal lies within thirty days of the decision.'],
    limitationRuleId: 'it-rules-2021-r3a',
    triggers: triggersOf({
      documentTypes: ['privacy_policy'],
      problems: ['platform_action_or_privacy'],
      driverSeverities: ['high'],
    }),
    caveats: ['The Committee reviews a decision; it is not a route for a money claim.'],
  },
  {
    ...BASE,
    id: 'legal_services_authority',
    statute: 'Legal Services Authorities Act, 1987, ss.12 and 13',
    portal: { name: 'NALSA', url: 'https://nalsa.gov.in/' },
    helpline: '15100 — NALSA legal services helpline',
    entitlements: ['s.12(c) and s.12(f) entitle every woman, child and industrial workman.'],
    limitationRuleId: null,
    triggers: triggersOf({ situations: ['cannot_afford_lawyer'], universal: true }),
    caveats: ['Applying does not stop the limitation period for the claim from running.'],
  },
];

/** Rows of `data/remedies/limitation.yaml`; the cause of action and stages are prose. */
const ruleOf = (
  rule: Pick<RemedyLimitationRule, 'id' | 'period' | 'statute' | 'condonationPossible'>,
): RemedyLimitationRule => ({
  causeOfAction: 'The date the cause of action arose.',
  statuteUrl: INDIA_CODE,
  stages: [],
  ...rule,
});

const LIMITATION: LimitationTable = [
  ruleOf({
    id: 'cpa-2019-s69',
    period: { unit: 'months', count: 24 },
    statute: 'Consumer Protection Act, 2019, s.69',
    condonationPossible: true,
  }),
  ruleOf({
    id: 'limitation-act-1963-art55',
    period: { unit: 'months', count: 36 },
    statute: 'Limitation Act, 1963, Schedule, art.55',
    condonationPossible: false,
  }),
  // The thirty days to appeal to a Grievance Appellate Committee are thirty days.
  ruleOf({
    id: 'it-rules-2021-r3a',
    period: { unit: 'days', count: 30 },
    statute: 'IT Rules, 2021, rule 3A(3)',
    condonationPossible: false,
  }),
];

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const stated = (said: Partial<RemedySituation>): RemedySituation => ({
  problem: null,
  causeOfActionDate: null,
  cannotAffordLawyer: false,
  prefersSettlement: false,
  ...said,
});

/** *Emaar MGF v Aftab Singh* (2018) — arbitration cannot bar the consumer forum. */
const ARBITRATION_VERDICT: EnforceabilityVerdict = {
  construct: 'unilateral_arbitrator_appointment',
  verdict: 'cannot_oust_this_forum',
  confidence: 'high',
  statute: { act: 'Consumer Protection Act, 2019', section: 's.100', text: 'In addition to and not in derogation of any other law.', url: INDIA_CODE },
  authorities: [],
  plainMeaning: 'An arbitration clause does not stop you going to the consumer commission.',
  caveats: ['Whether you are a consumer is for the Commission to decide.'],
  appliesTo: [],
  evidence: null,
};

const driverOf = (severity: Severity): RiskDriver => ({
  ruleId: 'payment_at_sole_discretion',
  tier: 'construct',
  severity,
  title: 'Payment is at their discretion',
  explain: 'They decide whether and when you are paid.',
  points: 8,
  evidence: null,
  askYourLawyer: null,
});

const facts = (documentType: FactView['documentType'], constructs = {}): FactView =>
  fakeFacts({ documentType, constructs });

const run = (given: Partial<Parameters<typeof routeNextSteps>[0]>): readonly NextStep[] =>
  routeNextSteps({
    facts: facts('other'),
    drivers: [],
    verdicts: [],
    forums: FORUMS,
    limitation: LIMITATION,
    situation: stated({}),
    today: utc('2026-09-13'),
    ...given,
  });

const idsOf = (steps: readonly NextStep[]): readonly string[] => steps.map((step) => step.forum.id);

describe('routeNextSteps', () => {
  it('offers only the routes open to everybody when nothing has gone wrong', () => {
    // A loan agreement is within the consumer commission's document types, but owning a
    // document is not a reason to send anyone to a forum. Called with no situation at
    // all, which is the state the first render of a report is in.
    const steps = routeNextSteps({
      facts: facts('loan_agreement'), drivers: [], verdicts: [],
      forums: FORUMS, limitation: LIMITATION, today: utc('2026-09-13'),
    });

    expect(idsOf(steps)).toEqual(['legal_services_authority']);
  });

  it("routes on the reader's account of the problem even when the document says otherwise", () => {
    // An NDA is outside the consumer commission's document types; the stated problem is
    // not, and what the reader says happened outranks the classifier.
    const steps = run({
      facts: facts('nda'),
      situation: stated({ problem: 'goods_or_services_defect' }),
    });

    expect(idsOf(steps)).toContain('consumer_commission');
    expect(steps[0]?.signals).toEqual([{ kind: 'problem', detail: 'goods_or_services_defect' }]);
  });

  it('reads a construct only within the document types the row applies to', () => {
    const present = { forfeiture_of_paid_amounts: 'present' } as const;

    expect(idsOf(run({ facts: facts('other', present) }))).toContain('consumer_commission');
    expect(idsOf(run({ facts: facts('rent_agreement', present) }))).not.toContain(
      'consumer_commission',
    );
  });

  it('surfaces the consumer commission when arbitration cannot oust it', () => {
    const steps = run({ facts: facts('loan_agreement'), verdicts: [ARBITRATION_VERDICT] });

    expect(steps[0]?.forum.id).toBe('consumer_commission');
    expect(steps[0]?.signals).toContainEqual({ kind: 'verdict', detail: 'cannot_oust_this_forum' });
  });

  it('surfaces a forum on a risk driver of a severity the row lists, and not on a lower one', () => {
    const freelance = facts('freelance_contract');

    expect(idsOf(run({ facts: freelance, drivers: [driverOf('critical')] }))).toContain('msefc');
    expect(idsOf(run({ facts: freelance, drivers: [driverOf('high')] }))).not.toContain('msefc');
  });

  it('carries the MSMED entitlement and the free Udyam registration to the freelancer', () => {
    const steps = run({
      facts: facts('freelance_contract', { sole_discretion_on_payment: 'present' }),
      situation: stated({ problem: 'unpaid_invoice' }),
    });

    expect(steps[0]?.forum.entitlements.join(' ')).toContain('three times the RBI bank rate');
    expect(steps[0]?.forum.prerequisites[0]?.url).toBe('https://udyamregistration.gov.in/');
  });

  it('pairs a forum with the countdown for its own limitation period', () => {
    const steps = run({
      situation: stated({
        problem: 'goods_or_services_defect',
        causeOfActionDate: utc('2026-01-01'),
      }),
    });

    expect(steps[0]?.clock?.deadline.toISOString()).toBe('2028-01-01T00:00:00.000Z');
    expect(steps[0]?.clock?.urgency).toBe('ample');
    expect(steps[0]?.clock?.condonationPossible).toBe(true);
    expect(steps[0]?.clock?.statute).toBe('Consumer Protection Act, 2019, s.69');
  });

  /**
   * Thirty days is not a month, and a deadline that is a day out is worthless. A month
   * from 31 January would be 28 February; the rule says thirty days, so it is 2 March.
   */
  it('counts a day-counted window in days rather than approximating it as a month', () => {
    const steps = run({
      facts: facts('privacy_policy'),
      situation: stated({
        problem: 'platform_action_or_privacy',
        causeOfActionDate: utc('2026-01-31'),
      }),
      today: utc('2026-02-10'),
    });

    expect(steps[0]?.clock?.deadline.toISOString()).toBe('2026-03-02T00:00:00.000Z');
    expect(steps[0]?.clock?.urgency).toBe('urgent');
  });

  /**
   * Inventing a start date would produce a deadline a reader might rely on. The rule is
   * still returned, so the period and the statute can be shown without a false date.
   */
  it('computes no deadline until the reader says when the problem happened', () => {
    const steps = run({
      situation: stated({ problem: 'goods_or_services_defect', cannotAffordLawyer: true }),
    });

    expect(steps[0]?.clock).toBeNull();
    expect(steps[0]?.limitationRule?.period).toEqual({ unit: 'months', count: 24 });
    // Free legal aid is not a claim, so it carries no filing window of its own.
    expect(steps[1]?.limitationRule).toBeNull();
  });

  it('ranks by how much of the dispute a route matched, and offers-to-all last', () => {
    const steps = run({
      facts: facts('privacy_policy', { forfeiture_of_paid_amounts: 'present' }),
      drivers: [driverOf('high')],
      situation: stated({ problem: 'platform_action_or_privacy', cannotAffordLawyer: true }),
    });

    expect(idsOf(steps)).toEqual([
      'grievance_appellate_committee',
      'consumer_commission',
      'legal_services_authority',
    ]);
    expect(steps[2]?.signals).toContainEqual({ kind: 'situation', detail: 'cannot_afford_lawyer' });
  });

  it('reports an expired period without letting it displace a route still open', () => {
    // Both routes matched one fact, and both clocks run from the same day. The thirty
    // days to appeal to the Committee ran out in 2024; the two-year consumer period has
    // eighteen days left, and condonation is a hope where an unexpired period is a right.
    const steps = run({
      facts: facts('privacy_policy'),
      drivers: [driverOf('high')],
      situation: stated({
        problem: 'goods_or_services_defect',
        causeOfActionDate: utc('2024-10-01'),
      }),
    });

    expect(idsOf(steps).slice(0, 2)).toEqual([
      'consumer_commission',
      'grievance_appellate_committee',
    ]);
    expect(steps[0]?.clock?.urgency).toBe('urgent');
    // An expired clock is still reported, and still says whether it can be excused.
    expect(steps[1]?.clock?.urgency).toBe('expired');
    expect(steps[1]?.clock?.condonationPossible).toBe(false);
  });

  /**
   * The advice boundary and the audit trail, as a test rather than a convention: a forum
   * may not be shown without what it does not decide, and every portal a reader is sent
   * to must be one they can check.
   */
  it('requires every row to carry a caveat, a citable statute and an https portal', () => {
    for (const forum of FORUMS) {
      expect(forum.caveats.length).toBeGreaterThan(0);
      expect(forum.portal.url).toMatch(/^https:/);
      expect(forum.statuteUrl).toMatch(/^https:/);
      expect(forum.fee.summary.length).toBeGreaterThan(0);
      for (const step of forum.prerequisites) {
        if (step.url !== null) expect(step.url).toMatch(/^https:/);
      }
    }
    for (const rule of LIMITATION) {
      expect(rule.statuteUrl).toMatch(/^https:/);
      expect(rule.period.count).toBeGreaterThan(0);
    }
  });
});
