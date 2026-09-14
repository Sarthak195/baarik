import { describe, expect, it } from 'vitest';

import type { AnalysisReport } from '@/core/report/types';
import type { GroundedFinding } from '@/core/grounding/verify';
import type { RiskDriver } from '@/core/risk/types';
import type { Benchmark, RubricRule } from '@/core/rubric/types';
import { benchmarksByRule, toReportView } from '@/lib/report-view';

import { emptyAnalysisReport } from '../server/samples/empty-report';

/**
 * The benchmark join — capability 2 of the brief, wired to the clause card.
 *
 * `RiskDriver` records which rule fired but not what that rule measures against, so
 * the benchmark has to be recovered from the rule itself. These tests pin the two
 * halves of that: the rule carries the citation, and the clause the rule fired on is
 * the clause that shows it. The negative case matters as much as the positive one —
 * most rules deliberately carry no benchmark, and inventing one for them would be the
 * worst failure this feature could have.
 */

const DEPOSIT_BENCHMARK: Benchmark = {
  source:
    'Model Tenancy Act, 2021, section 11 — a model law, binding only where a State has enacted it',
  url: 'https://mohua.gov.in/upload/uploadfiles/files/Model-Tenancy-Act-English-02_06_2021.pdf',
  text: "The security deposit paid in advance by the tenant shall not exceed two months' rent in the case of residential premises.",
};

function rule(id: string, benchmark: Benchmark | null): RubricRule {
  return {
    id,
    tier: 'threshold',
    title: 'A threshold rule',
    appliesTo: [],
    when: { op: 'gt', field: 'securityDepositInr', value: 0 },
    severity: 'high',
    weight: 10,
    explain: { en: 'English.', hi: 'हिन्दी।' },
    benchmark,
    askYourLawyer: null,
    evidenceFrom: 'securityDepositInr',
  };
}

const TEXT = 'The tenant shall pay a security deposit of Rs 10,00,000 before taking possession.';
const QUOTE = 'a security deposit of Rs 10,00,000';
const START = TEXT.indexOf(QUOTE);

function finding(): GroundedFinding {
  return {
    id: 'f1',
    category: 'deposit',
    exactQuote: QUOTE,
    clauseLabel: '3.1',
    plainSummary: 'You must pay ten months of rent as a deposit.',
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
    location: {
      start: START,
      end: START + QUOTE.length,
      matchedText: QUOTE,
      method: 'exact',
      similarity: 1,
    },
    segmentId: 's1',
    pageNumber: 1,
  };
}

function driver(ruleId: string): RiskDriver {
  return {
    ruleId,
    tier: 'threshold',
    severity: 'high',
    title: 'Security deposit of three months’ rent or more',
    explain: 'The deposit is Rs 10,00,000 against rent of Rs 1,00,000 a month.',
    points: 16,
    evidence: {
      start: START,
      end: START + QUOTE.length,
      matchedText: QUOTE,
      method: 'exact',
      similarity: 1,
    },
    askYourLawyer: null,
  };
}

function analysis(ruleId: string): AnalysisReport {
  const base = emptyAnalysisReport();
  return {
    ...base,
    documentType: 'rent_agreement',
    findings: [finding()],
    risk: { ...base.risk, drivers: [driver(ruleId)], topDrivers: [driver(ruleId)] },
  };
}

function view(ruleId: string, rules: readonly RubricRule[]) {
  return toReportView({
    analysis: analysis(ruleId),
    documentText: TEXT,
    title: 'A rent agreement',
    blurb: 'A sample.',
    rules,
  });
}

describe('benchmarksByRule', () => {
  it('indexes only the rules that carry a published source', () => {
    const index = benchmarksByRule([
      rule('deposit_high', DEPOSIT_BENCHMARK),
      rule('lock_in_long', null),
    ]);

    expect([...index.keys()]).toEqual(['deposit_high']);
    expect(index.get('deposit_high')).toEqual(DEPOSIT_BENCHMARK);
  });

  it('returns an empty index rather than throwing when no rule carries one', () => {
    expect(benchmarksByRule([rule('lock_in_long', null)]).size).toBe(0);
  });
});

describe('toReportView', () => {
  it('carries the fired rule’s benchmark onto the clause it fired on', () => {
    const report = view('deposit_high', [rule('deposit_high', DEPOSIT_BENCHMARK)]);

    expect(report.clauses).toHaveLength(1);
    expect(report.clauses[0]?.benchmark).toEqual(DEPOSIT_BENCHMARK);
  });

  /**
   * The optionality of `benchmark` is the honesty of the feature, not an oversight:
   * a threshold that is this project's own judgement must render with no citation
   * rather than with a borrowed one.
   */
  it('leaves the benchmark undefined where the rule declares none', () => {
    const report = view('lock_in_long', [rule('lock_in_long', null)]);

    expect(report.clauses[0]?.driver?.ruleId).toBe('lock_in_long');
    expect(report.clauses[0]?.benchmark).toBeUndefined();
  });

  it('does not borrow another rule’s benchmark when the fired rule is unknown', () => {
    const report = view('some_other_rule', [rule('deposit_high', DEPOSIT_BENCHMARK)]);

    expect(report.clauses[0]?.benchmark).toBeUndefined();
  });
});
