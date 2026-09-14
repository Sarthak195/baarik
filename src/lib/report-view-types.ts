import type { GroundingStats, RejectedFinding } from '@/core/grounding/verify';
import type { NextStep } from '@/core/remedies/types';
import type { RiskReport } from '@/core/risk/types';
import type { ClauseView } from './clause-view';
import type { DocumentType } from '@/schemas/document-type';

/**
 * Everything the report page renders, in one object.
 *
 * This is deliberately the shape the real pipeline will return. When
 * `src/server/ingest` is wired in, the page's `getReport` call changes and nothing
 * below it does — which is the test of whether the components really are pure
 * functions of their props, rather than components that happen to be today.
 */
/**
 * What the report page renders.
 *
 * Named for what it is rather than where it came from: the same shape carries a
 * committed fixture and a live analysis, and `src/lib/report-view.ts` adapts pipeline
 * output into it. The page is a pure function of this type, so the source of a report
 * can change without any component knowing.
 */
export interface ReportView {
  /** The URL segment. Stable, because these links get shared. */
  readonly id: string;
  readonly title: string;
  readonly documentType: DocumentType;
  /** One line for the sample list on the landing page. */
  readonly blurb: string;
  /** The canonical text. Every offset in every clause indexes into this string. */
  readonly documentText: string;
  readonly clauses: readonly ClauseView[];
  readonly risk: RiskReport;
  readonly grounding: GroundingStats;
  /** Shown, never hidden. ADR: a suppressed failure rate is worse than a visible one. */
  readonly rejected: readonly RejectedFinding[];
  readonly nextSteps: readonly NextStep[];
  /**
   * True when a limitation period on one of the routes is close or has run. Drives the
   * hard interrupt in `src/components/disclaimer/TimeSensitiveInterrupt.tsx`.
   */
  readonly timeSensitive: boolean;
}

/** The subset the landing page needs, so that it does not pull in every report body. */
export interface SampleSummary {
  readonly id: string;
  readonly title: string;
  readonly documentType: DocumentType;
  readonly blurb: string;
}
