import { describe, expect, it } from 'vitest';

import { evaluatePredicate, predicateInputs } from '@/core/risk/predicates';
import type { Predicate, Trilean } from '@/core/risk/types';
import { fakeFacts } from '../../../fakes/fact-view';

/**
 * The engine's central safety property is that ignorance never masquerades as a
 * finding. These tests pin that down case by case, because the failure mode is silent:
 * a rule that answers `false` on missing data simply never fires, and a rule that
 * answers `true` accuses a contract of something the document never said.
 */

describe('evaluatePredicate — numeric comparison', () => {
  it('compares a known number against a threshold', () => {
    const facts = fakeFacts({ numbers: { lockInMonths: 12 } });
    expect(evaluatePredicate({ op: 'gte', field: 'lockInMonths', value: 6 }, facts)).toBe('true');
    expect(evaluatePredicate({ op: 'gte', field: 'lockInMonths', value: 24 }, facts)).toBe('false');
  });

  it('supports the full comparison set', () => {
    const facts = fakeFacts({ numbers: { paymentTermDays: 45 } });
    expect(evaluatePredicate({ op: 'gt', field: 'paymentTermDays', value: 45 }, facts)).toBe(
      'false',
    );
    expect(evaluatePredicate({ op: 'gte', field: 'paymentTermDays', value: 45 }, facts)).toBe(
      'true',
    );
    expect(evaluatePredicate({ op: 'lte', field: 'paymentTermDays', value: 45 }, facts)).toBe(
      'true',
    );
    expect(evaluatePredicate({ op: 'lt', field: 'paymentTermDays', value: 45 }, facts)).toBe(
      'false',
    );
  });

  it('answers unknown — never false — when the number was not determined', () => {
    const facts = fakeFacts({});
    for (const op of ['gte', 'gt', 'lte', 'lt'] as const) {
      expect(evaluatePredicate({ op, field: 'lockInMonths', value: 6 }, facts)).toBe('unknown');
    }
  });
});

describe('evaluatePredicate — field_missing', () => {
  /**
   * `field_missing` asks about the EXTRACTION, not about the contract. It answers
   * definitely either way, because whether a number was determined is always knowable —
   * unlike `construct_absent`, which asks whether a clause is really absent and must
   * stay unknown when the document was unclear.
   */
  it('is true when a number was not determined and false when it was', () => {
    expect(evaluatePredicate({ op: 'field_missing', field: 'liabilityCapInr' }, fakeFacts({}))).toBe(
      'true',
    );
    expect(
      evaluatePredicate(
        { op: 'field_missing', field: 'liabilityCapInr' },
        fakeFacts({ numbers: { liabilityCapInr: 100_000 } }),
      ),
    ).toBe('false');
  });

  it('never returns unknown, unlike construct_absent', () => {
    const facts = fakeFacts({});
    expect(evaluatePredicate({ op: 'field_missing', field: 'lockInMonths' }, facts)).not.toBe(
      'unknown',
    );
    expect(
      evaluatePredicate({ op: 'construct_absent', construct: 'jurisdiction_clause' }, facts),
    ).toBe('unknown');
  });
});

describe('evaluatePredicate — asymmetry', () => {
  it('fires when one side owes disproportionately more notice', () => {
    const facts = fakeFacts({
      numbers: { noticeDaysYouMustGive: 90, noticeDaysTheyMustGive: 30 },
    });
    const rule: Predicate = {
      op: 'ratio_gte',
      numerator: 'noticeDaysYouMustGive',
      denominator: 'noticeDaysTheyMustGive',
      value: 2,
    };
    expect(evaluatePredicate(rule, facts)).toBe('true');
  });

  it('does not fire on symmetric notice', () => {
    const facts = fakeFacts({
      numbers: { noticeDaysYouMustGive: 30, noticeDaysTheyMustGive: 30 },
    });
    const rule: Predicate = {
      op: 'ratio_gte',
      numerator: 'noticeDaysYouMustGive',
      denominator: 'noticeDaysTheyMustGive',
      value: 2,
    };
    expect(evaluatePredicate(rule, facts)).toBe('false');
  });

  it('treats a zero denominator as maximal asymmetry only when this side owes something', () => {
    const rule: Predicate = {
      op: 'ratio_gte',
      numerator: 'noticeDaysYouMustGive',
      denominator: 'noticeDaysTheyMustGive',
      value: 2,
    };
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { noticeDaysYouMustGive: 60, noticeDaysTheyMustGive: 0 } }),
      ),
    ).toBe('true');
    // Neither side owes notice: that is a different contract, not an asymmetric one.
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { noticeDaysYouMustGive: 0, noticeDaysTheyMustGive: 0 } }),
      ),
    ).toBe('unknown');
  });

  it('measures a deposit as a multiple of monthly rent', () => {
    const rule: Predicate = {
      op: 'multiple_gte',
      field: 'securityDepositInr',
      of: 'monthlyRentInr',
      value: 3,
    };
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { securityDepositInr: 300_000, monthlyRentInr: 30_000 } }),
      ),
    ).toBe('true');
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { securityDepositInr: 60_000, monthlyRentInr: 30_000 } }),
      ),
    ).toBe('false');
  });

  it('scales the base when asked, so an annual figure can be compared per month', () => {
    // A bond worth more than six months of CTC.
    const rule: Predicate = {
      op: 'multiple_gte',
      field: 'bondAmountInr',
      of: 'annualCtcInr',
      divideBaseBy: 12,
      value: 6,
    };
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { bondAmountInr: 200_000, annualCtcInr: 360_000 } }),
      ),
    ).toBe('true');
    expect(
      evaluatePredicate(
        rule,
        fakeFacts({ numbers: { bondAmountInr: 45_000, annualCtcInr: 1_200_000 } }),
      ),
    ).toBe('false');
  });
});

describe('evaluatePredicate — constructs and absence', () => {
  it('distinguishes present, absent and unclear', () => {
    const present: Predicate = {
      op: 'construct_present',
      construct: 'post_employment_non_compete',
    };
    expect(
      evaluatePredicate(
        present,
        fakeFacts({ constructs: { post_employment_non_compete: 'present' } }),
      ),
    ).toBe('true');
    expect(
      evaluatePredicate(
        present,
        fakeFacts({ constructs: { post_employment_non_compete: 'absent' } }),
      ),
    ).toBe('false');
    expect(
      evaluatePredicate(
        present,
        fakeFacts({ constructs: { post_employment_non_compete: 'unclear' } }),
      ),
    ).toBe('unknown');
  });

  it('fires an absence rule only when absence was actually established', () => {
    const absent: Predicate = { op: 'construct_absent', construct: 'deposit_refund_timeline' };

    expect(
      evaluatePredicate(absent, fakeFacts({ constructs: { deposit_refund_timeline: 'absent' } })),
    ).toBe('true');
    // The whole point: an unread document must not be accused of omitting a clause.
    expect(
      evaluatePredicate(absent, fakeFacts({ constructs: { deposit_refund_timeline: 'unclear' } })),
    ).toBe('unknown');
    expect(evaluatePredicate(absent, fakeFacts({}))).toBe('unknown');
  });
});

describe('evaluatePredicate — Kleene combinators', () => {
  const T: Predicate = { op: 'gte', field: 'lockInMonths', value: 1 };
  const F: Predicate = { op: 'gte', field: 'lockInMonths', value: 99 };
  const U: Predicate = { op: 'gte', field: 'termMonths', value: 1 };
  const facts = fakeFacts({ numbers: { lockInMonths: 12 } });

  const cases: readonly (readonly [string, Predicate, Trilean])[] = [
    ['all_of(T,T)', { op: 'all_of', of: [T, T] }, 'true'],
    ['all_of(T,F)', { op: 'all_of', of: [T, F] }, 'false'],
    ['all_of(T,U)', { op: 'all_of', of: [T, U] }, 'unknown'],
    // One definite false settles a conjunction regardless of what is unknown.
    ['all_of(F,U)', { op: 'all_of', of: [F, U] }, 'false'],
    ['any_of(F,F)', { op: 'any_of', of: [F, F] }, 'false'],
    ['any_of(F,U)', { op: 'any_of', of: [F, U] }, 'unknown'],
    // One definite true settles a disjunction regardless of what is unknown.
    ['any_of(T,U)', { op: 'any_of', of: [T, U] }, 'true'],
    ['not(T)', { op: 'not', of: T }, 'false'],
    ['not(F)', { op: 'not', of: F }, 'true'],
    ['not(U)', { op: 'not', of: U }, 'unknown'],
  ];

  for (const [name, predicate, expected] of cases) {
    it(`${name} evaluates to ${expected}`, () => {
      expect(evaluatePredicate(predicate, facts)).toBe(expected);
    });
  }
});

describe('predicateInputs', () => {
  it('reports every fact a nested predicate depends on, so unknowns can be explained', () => {
    const predicate: Predicate = {
      op: 'all_of',
      of: [
        { op: 'construct_absent', construct: 'exit_or_termination_route' },
        {
          op: 'ratio_gte',
          numerator: 'noticeDaysYouMustGive',
          denominator: 'noticeDaysTheyMustGive',
          value: 2,
        },
      ],
    };

    expect(predicateInputs(predicate)).toEqual([
      'exit_or_termination_route',
      'noticeDaysYouMustGive',
      'noticeDaysTheyMustGive',
    ]);
  });
});
