import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import type { RiskDriver } from '@/core/risk/types';
import {
  confidenceFor,
  type ClauseAction,
  type ClauseConfidence,
  type ClauseView,
  type FavoursArithmetic,
} from '@/lib/clause-view';
import type { RawFinding } from '@/schemas/finding';
import { groundFinding } from './ground';

export interface ClauseSpec {
  readonly finding: RawFinding;
  readonly page: number;
  readonly whyItMatters: string;
  readonly favours: FavoursArithmetic;
  readonly actions: readonly ClauseAction[];
  readonly driver?: RiskDriver | undefined;
  readonly law?: EnforceabilityVerdict | undefined;
  /**
   * Set only where the law genuinely differs between States and the derivation cannot
   * know it — notice periods under the Shops and Establishments Acts, rent control,
   * stamp duty. Everywhere else the confidence row is derived rather than asserted, so
   * that it cannot quietly become an optimistic label someone typed.
   */
  readonly confidenceOverride?: ClauseConfidence | undefined;
}

/** Joins one finding to whatever each engine had to say about it. */
export function buildClause(documentText: string, spec: ClauseSpec): ClauseView {
  const finding = groundFinding(documentText, spec.finding, spec.page);
  const law = spec.law ?? null;

  return {
    finding,
    driver: spec.driver ?? null,
    enforceability: law,
    whyItMatters: spec.whyItMatters,
    favours: spec.favours,
    actions: spec.actions,
    confidence: spec.confidenceOverride ?? confidenceFor(finding, law),
  };
}
