import type { DocumentType } from '../../schemas/document-type';
import type { GroundedFinding } from '../grounding/verify';
import type { FactView } from '../risk/types';
import type { EnforceabilityTable, EnforceabilityVerdict } from './types';

/**
 * Match a document's constructs against the statute table.
 *
 * The function is deliberately dull: it looks up rows, filters by document type, and
 * attaches evidence. All the legal content lives in `data/enforceability/*.yaml`,
 * which is the property that makes the feature auditable — a reader can check every
 * verdict against the Act without reading a line of TypeScript.
 *
 * A verdict is produced only when a construct is `present`. `unclear` yields nothing:
 * telling someone a clause is void when the extractor was not sure the clause exists
 * would be worse than saying nothing at all.
 */
export function triageEnforceability(input: {
  readonly facts: FactView;
  readonly findings: readonly GroundedFinding[];
  readonly table: EnforceabilityTable;
  readonly documentType: DocumentType;
}): readonly EnforceabilityVerdict[] {
  const verdicts: EnforceabilityVerdict[] = [];

  for (const rule of input.table) {
    if (rule.appliesTo.length > 0 && !rule.appliesTo.includes(input.documentType)) continue;
    if (input.facts.construct(rule.construct) !== 'present') continue;

    verdicts.push({
      ...rule,
      evidence: input.facts.evidenceFor(rule.construct) ?? findingEvidence(input.findings, rule.construct),
    });
  }

  // Strongest verdicts first: a reader scanning the list should meet "this probably
  // does not bind you" before "this binds but is negotiable".
  return [...verdicts].sort(
    (left, right) =>
      severityOf(right.verdict) - severityOf(left.verdict) ||
      left.construct.localeCompare(right.construct),
  );
}

/**
 * Fall back to a finding's own location when the fact extractor supplied no evidence
 * for the construct, so a verdict can still be traced to text in the document.
 */
function findingEvidence(
  findings: readonly GroundedFinding[],
  construct: string,
): EnforceabilityVerdict['evidence'] {
  const category = CONSTRUCT_TO_CATEGORY[construct];
  if (category === undefined) return null;
  return findings.find((finding) => finding.category === category)?.location ?? null;
}

/**
 * Which finding category most likely carries the text behind a construct. Used only
 * to recover a citation when the fact extractor did not supply one; a wrong guess
 * costs a highlight, never a verdict.
 */
const CONSTRUCT_TO_CATEGORY: Readonly<Record<string, string>> = {
  post_employment_non_compete: 'restraint_of_trade',
  contractual_limitation_period: 'dispute_resolution',
  unilateral_arbitrator_appointment: 'dispute_resolution',
  forfeiture_of_paid_amounts: 'penalty',
  unlimited_indemnity: 'indemnity',
  unilateral_amendment_without_notice: 'unilateral_change',
  automatic_renewal_without_notice: 'renewal',
  assignment_of_future_ip: 'ip_assignment',
  self_help_remedy: 'termination',
  sole_discretion_on_payment: 'payment',
  class_action_waiver: 'dispute_resolution',
  cross_default: 'termination',
};

/** Ordering weight only — not a claim about legal significance. */
function severityOf(verdict: EnforceabilityVerdict['verdict']): number {
  switch (verdict) {
    case 'likely_void':
      return 5;
    case 'likely_unenforceable_as_written':
      return 4;
    case 'cannot_oust_this_forum':
      return 3;
    case 'capped_by_statute':
      return 2;
    case 'enforceable_but_negotiable':
      return 1;
    case 'context_dependent':
      return 0;
  }
}
