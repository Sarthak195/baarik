import { describe, expect, it } from 'vitest';

import { scoreDocument } from '@/core/risk/engine';
import type { KnowledgeBase, RubricRule } from '@/core/rubric/types';
import { fakeFacts } from '../../../fakes/fact-view';

function rule(overrides: Partial<RubricRule> & Pick<RubricRule, 'id' | 'when'>): RubricRule {
  return {
    tier: 'threshold',
    title: 'A rule',
    appliesTo: [],
    severity: 'high',
    weight: 10,
    explain: { en: 'Something happened.', hi: 'कुछ हुआ।' },
    benchmark: null,
    askYourLawyer: null,
    evidenceFrom: null,
    ...overrides,
  };
}

function knowledge(rules: readonly RubricRule[]): KnowledgeBase {
  return {
    version: '1.0.0-test',
    rules,
    config: {
      saturation: 45,
      tierCaps: { asymmetry: 40, threshold: 45, construct: 45, absence: 40 },
      bands: [
        { upTo: 24, band: 'low' },
        { upTo: 49, band: 'moderate' },
        { upTo: 74, band: 'high' },
        { upTo: 100, band: 'severe' },
      ],
    },
  };
}

describe('scoreDocument', () => {
  it('fires a rule whose predicate is satisfied and reports it as a driver', () => {
    const report = scoreDocument({
      facts: fakeFacts({ numbers: { lockInMonths: 12 } }),
      knowledge: knowledge([rule({ id: 'long_lock_in', when: { op: 'gt', field: 'lockInMonths', value: 6 } })]),
    });

    expect(report.drivers.map((driver) => driver.ruleId)).toEqual(['long_lock_in']);
    expect(report.score).toBeGreaterThan(0);
  });

  it('does not fire a rule whose predicate is definitely false', () => {
    const report = scoreDocument({
      facts: fakeFacts({ numbers: { lockInMonths: 3 } }),
      knowledge: knowledge([rule({ id: 'long_lock_in', when: { op: 'gt', field: 'lockInMonths', value: 6 } })]),
    });

    expect(report.drivers).toHaveLength(0);
    expect(report.unknowns).toHaveLength(0);
    expect(report.score).toBe(0);
  });

  /**
   * The honest failure mode. A document nobody could read must produce questions, not
   * a confidently low score, because a low score is an assertion a reader may act on.
   */
  it('turns an undecidable rule into a question rather than a clean bill of health', () => {
    const report = scoreDocument({
      facts: fakeFacts({}),
      knowledge: knowledge([
        rule({
          id: 'long_lock_in',
          when: { op: 'gt', field: 'lockInMonths', value: 6 },
          askYourLawyer: 'How long am I locked in for?',
        }),
      ]),
    });

    expect(report.drivers).toHaveLength(0);
    expect(report.score).toBe(0);
    expect(report.unknowns).toEqual([
      { ruleId: 'long_lock_in', missing: ['lockInMonths'], question: 'How long am I locked in for?' },
    ]);
  });

  it('falls back to the rule title when the author supplied no question', () => {
    const report = scoreDocument({
      facts: fakeFacts({}),
      knowledge: knowledge([
        rule({ id: 'r', title: 'whether the deposit is refundable', when: { op: 'gt', field: 'lockInMonths', value: 6 } }),
      ]),
    });

    expect(report.unknowns[0]?.question).toContain('whether the deposit is refundable');
  });

  it('skips a rule that does not apply to this document type', () => {
    const report = scoreDocument({
      facts: fakeFacts({ documentType: 'rent_agreement', numbers: { bondAmountInr: 200_000 } }),
      knowledge: knowledge([
        rule({
          id: 'employment_only',
          appliesTo: ['employment_offer'],
          when: { op: 'gt', field: 'bondAmountInr', value: 0 },
        }),
      ]),
    });

    expect(report.drivers).toHaveLength(0);
  });

  it('ranks drivers by weight and exposes the top three', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    const when = { op: 'gt', field: 'lockInMonths', value: 1 } as const;
    const report = scoreDocument({
      facts,
      knowledge: knowledge([
        rule({ id: 'small', weight: 5, when }),
        rule({ id: 'largest', weight: 20, when }),
        rule({ id: 'medium', weight: 12, when }),
        rule({ id: 'tiny', weight: 2, when }),
      ]),
    });

    expect(report.topDrivers.map((driver) => driver.ruleId)).toEqual(['largest', 'medium', 'small']);
    expect(report.drivers).toHaveLength(4);
  });

  it('breaks ties on rule id so output is byte-stable for golden comparison', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    const when = { op: 'gt', field: 'lockInMonths', value: 1 } as const;
    const report = scoreDocument({
      facts,
      knowledge: knowledge([
        rule({ id: 'zebra', weight: 10, when }),
        rule({ id: 'alpha', weight: 10, when }),
      ]),
    });

    expect(report.drivers.map((driver) => driver.ruleId)).toEqual(['alpha', 'zebra']);
  });

  it('caps a tier so one category cannot carry the whole score', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    const when = { op: 'gt', field: 'lockInMonths', value: 1 } as const;
    // Six absence rules at 20 points each would total 120 against a cap of 40.
    const rules = Array.from({ length: 6 }, (_unused, index) =>
      rule({ id: `absence_${String(index)}`, tier: 'absence', weight: 20, when }),
    );

    const report = scoreDocument({ facts, knowledge: knowledge(rules) });

    expect(report.tierTotals.absence).toBe(40);
  });

  it('keeps the score monotone in accumulated weight and inside [0, 100]', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    const when = { op: 'gt', field: 'lockInMonths', value: 1 } as const;

    const scores = [1, 2, 3, 4].map((count) => {
      const rules = Array.from({ length: count }, (_unused, index) =>
        rule({ id: `r${String(index)}`, tier: 'threshold', weight: 10, when }),
      );
      return scoreDocument({ facts, knowledge: knowledge(rules) }).score;
    });

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1] ?? 0);
    }
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('assigns a band from the score', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    const when = { op: 'gt', field: 'lockInMonths', value: 1 } as const;

    const low = scoreDocument({
      facts,
      knowledge: knowledge([rule({ id: 'a', weight: 5, when })]),
    });
    const severe = scoreDocument({
      facts,
      knowledge: knowledge([
        rule({ id: 'a', tier: 'threshold', weight: 45, when }),
        rule({ id: 'b', tier: 'absence', weight: 40, when }),
        rule({ id: 'c', tier: 'construct', weight: 45, when }),
        rule({ id: 'd', tier: 'asymmetry', weight: 40, when }),
      ]),
    });

    expect(low.band).toBe('low');
    expect(severe.band).toBe('severe');
  });

  it('renders the explanation in the requested language with Indian digit grouping', () => {
    const facts = fakeFacts({ numbers: { bondAmountInr: 200_000 } });
    const rules = [
      rule({
        id: 'bond',
        when: { op: 'gt', field: 'bondAmountInr', value: 0 },
        explain: {
          en: 'They can claim Rs. {bondAmountInr} from you.',
          hi: 'वे आपसे {bondAmountInr} रुपये मांग सकते हैं।',
        },
      }),
    ];

    expect(scoreDocument({ facts, knowledge: knowledge(rules) }).drivers[0]?.explain).toBe(
      'They can claim Rs. 2,00,000 from you.',
    );
    expect(
      scoreDocument({ facts, knowledge: knowledge(rules), language: 'hi' }).drivers[0]?.explain,
    ).toBe('वे आपसे 2,00,000 रुपये मांग सकते हैं।');
  });

  it('carries the rubric version so a report can be traced to the rules that produced it', () => {
    const report = scoreDocument({ facts: fakeFacts({}), knowledge: knowledge([rule({ id: 'r', when: { op: 'gt', field: 'lockInMonths', value: 1 } })]) });
    expect(report.rubricVersion).toBe('1.0.0-test');
  });
});
