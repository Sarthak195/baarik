import type { AnalysisReport } from '@/core/report/types';
import type { GroundedFinding } from '@/core/grounding/verify';
import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import type { RiskDriver } from '@/core/risk/types';
import type { Benchmark, RubricRule } from '@/core/rubric/types';
import { loadKnowledge } from '@/server/knowledge/repository';
import {
  confidenceFor,
  type ClauseAction,
  type ClauseView,
  type FavoursArithmetic,
} from './clause-view';
import type { Party } from '@/schemas/finding';
import type { ReportView } from './demo/types';

/**
 * Turning a pipeline result into what the report page renders.
 *
 * The page is a pure function of `ReportView`, so this adapter is the only thing that
 * has to change when the source of a report changes. It is also what lets the
 * committed fixtures and a live analysis render through identical components — the
 * demo path is not a special case of the UI, it is the same code with a different
 * supplier.
 */
export function toReportView(input: {
  readonly analysis: AnalysisReport;
  readonly documentText: string;
  readonly title: string;
  readonly blurb: string;
  /**
   * The rules the analysis was scored against. Defaults to the loaded knowledge base,
   * because a driver records which rule fired but not what that rule is measured
   * against, and re-reading the rules here is free — `loadKnowledge` is memoised.
   */
  readonly rules?: readonly RubricRule[] | undefined;
}): ReportView {
  const driversByRule = new Map(input.analysis.risk.drivers.map((d) => [d.ruleId, d]));
  const lawByConstruct = new Map(
    input.analysis.enforceability.map((verdict) => [verdict.construct, verdict]),
  );
  const benchmarks = benchmarksByRule(input.rules ?? loadKnowledge().rubric.rules);

  return {
    id: input.analysis.reportId,
    title: input.title,
    documentType: input.analysis.documentType,
    blurb: input.blurb,
    documentText: input.documentText,
    clauses: input.analysis.findings.map((finding) =>
      toClauseView(finding, driversByRule, lawByConstruct, benchmarks),
    ),
    risk: input.analysis.risk,
    grounding: input.analysis.grounding,
    rejected: input.analysis.rejected,
    nextSteps: input.analysis.nextSteps,
    // The interrupt is owed to the reader whenever a deadline is close enough that
    // reading a risk report is the wrong thing to be doing next.
    timeSensitive: input.analysis.nextSteps.some(
      (step) => step.clock !== null && (step.clock.urgency === 'urgent' || step.clock.urgency === 'expired'),
    ),
  };
}

/**
 * Join a finding to the rule that fired on it and the statute row that covers it.
 *
 * The join is by evidence position rather than by identity, because the model that
 * produced the finding and the rubric that produced the driver never saw each other.
 * A driver whose evidence overlaps this finding's span is talking about this clause.
 */
function toClauseView(
  finding: GroundedFinding,
  driversByRule: ReadonlyMap<string, RiskDriver>,
  lawByConstruct: ReadonlyMap<string, EnforceabilityVerdict>,
  benchmarks: ReadonlyMap<string, Benchmark>,
): ClauseView {
  const driver = findOverlapping([...driversByRule.values()], finding);
  const law = findOverlapping([...lawByConstruct.values()], finding);

  return {
    finding,
    driver: driver ?? null,
    enforceability: law ?? null,
    // Joined by rule id rather than by span, unlike the two above: the benchmark
    // belongs to the rule that fired, so once the driver is known there is nothing
    // left to match. Most rules have none, and the row simply does not appear.
    benchmark: driver === undefined ? undefined : benchmarks.get(driver.ruleId),
    // The rule's rendered explanation already carries this document's own numbers,
    // which is exactly what "why it matters" asks for; the plain summary is the
    // fallback when no rule fired on the clause.
    whyItMatters: driver?.explain ?? finding.plainSummary,
    favours: favoursFrom(finding),
    actions: actionsFrom(driver ?? null, law ?? null),
    confidence: confidenceFor(finding, law ?? null),
  };
}

/**
 * Index the published baselines the rubric carries, by the rule that carries them.
 *
 * Only a minority of rules qualify. A benchmark has to be a real, citable, published
 * figure — the Model Tenancy Act's two months' deposit, the MSMED Act's forty-five
 * days — and where a threshold is this project's own judgement the rule deliberately
 * carries none. A fabricated citation in a legal tool is worse than a bare number.
 */
export function benchmarksByRule(rules: readonly RubricRule[]): ReadonlyMap<string, Benchmark> {
  const index = new Map<string, Benchmark>();
  for (const rule of rules) {
    if (rule.benchmark !== null) index.set(rule.id, rule.benchmark);
  }
  return index;
}

/** The first item whose evidence span overlaps the finding, if any. */
function findOverlapping<T extends { readonly evidence: { start: number; end: number } | null }>(
  items: readonly T[],
  finding: GroundedFinding,
): T | undefined {
  return items.find((item) => {
    if (item.evidence === null) return false;
    return item.evidence.start < finding.location.end && finding.location.start < item.evidence.end;
  });
}

/**
 * Who the clause favours, from the finding's own obligation and benefit fields.
 *
 * Derived rather than asked for: the model reports who must do something and who is
 * protected, and the lean follows from those two answers. A clause that obliges the
 * reader and protects the other side leans fully against them.
 */
function favoursFrom(finding: GroundedFinding): FavoursArithmetic {
  // Two paired rights are visible on a single finding: who must act, and who gains.
  const steps: string[] = [];
  let yourShare = 0;

  if (finding.obligationOn === 'counterparty') {
    yourShare += 1;
    steps.push('The obligation in this clause falls on the other side.');
  } else if (finding.obligationOn === 'you') {
    steps.push('The obligation in this clause falls on you.');
  } else {
    steps.push('The obligation in this clause is shared or unclear.');
  }

  if (finding.benefits === 'you') {
    yourShare += 1;
    steps.push('The protection in this clause runs to you.');
  } else if (finding.benefits === 'counterparty') {
    steps.push('The protection in this clause runs to the other side.');
  } else {
    steps.push('The protection in this clause is shared or unclear.');
  }

  const side: Party = yourShare > 1 ? 'you' : yourShare < 1 ? 'counterparty' : 'both';
  return { side, yourShare, pairedRights: 2, steps };
}

/**
 * What the reader can do about the clause.
 *
 * The rule author's `askYourLawyer` is preferred where one exists, because it was
 * written for this specific clause; the generic options are the floor, never a
 * recommendation about which to take.
 */
function actionsFrom(
  driver: RiskDriver | null,
  law: EnforceabilityVerdict | null,
): readonly ClauseAction[] {
  const actions: ClauseAction[] = [];

  if (driver !== null && driver.askYourLawyer !== null) {
    actions.push({ kind: 'ask', label: driver.askYourLawyer, replacementText: null });
  }
  if (law !== null) {
    actions.push({
      kind: 'ask',
      label: `Ask an advocate how ${law.statute.section} applies to your situation.`,
      replacementText: null,
    });
  }
  if (actions.length === 0) {
    actions.push({
      kind: 'accept',
      label: 'Nothing in this system flagged this clause as unusual.',
      replacementText: null,
    });
  }
  return actions;
}
