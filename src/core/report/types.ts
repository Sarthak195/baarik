import type { Inconsistency } from '../consistency/types';
import type { EnforceabilityVerdict } from '../enforceability/types';
import type { GroundedFinding, GroundingStats, RejectedFinding } from '../grounding/verify';
import type { NextStep } from '../remedies/types';
import type { RiskReport } from '../risk/types';
import type { DocumentType, OutputLanguage } from '../../schemas/document-type';

/**
 * The finished analysis.
 *
 * Composed in the server from parts that were each validated where they entered the
 * system — model output through Zod, YAML through the knowledge-base schemas — so
 * this type is a plain interface rather than another runtime schema. Re-validating a
 * value the program itself just built would check the program against itself.
 *
 * It lives in `src/core` because both the pipeline that produces it and the
 * components that render it need it, and a UI component may not import from
 * `src/server`.
 */
export interface AnalysisReport {
  readonly reportId: string;
  readonly documentHash: string;
  readonly documentType: DocumentType;
  readonly language: OutputLanguage;

  readonly risk: RiskReport;
  readonly findings: readonly GroundedFinding[];
  /**
   * Findings that failed verification. Kept, not discarded, because the rejection
   * rate is information the reader is entitled to — and because a hostile document
   * suppressing its own findings shows up here rather than nowhere.
   */
  readonly rejected: readonly RejectedFinding[];
  readonly grounding: GroundingStats;

  readonly enforceability: readonly EnforceabilityVerdict[];
  readonly inconsistencies: readonly Inconsistency[];
  readonly nextSteps: readonly NextStep[];

  readonly meta: ReportMeta;
}

export interface ReportMeta {
  readonly rubricVersion: string;
  readonly modelsUsed: readonly string[];
  readonly stageTimingsMs: Readonly<Record<string, number>>;
  /**
   * True when the document exceeded the canonical-length cap. Surfaced to the reader:
   * silently analysing the first half of a contract and reporting low risk is the
   * worst answer this system could give.
   */
  readonly truncated: boolean;
  /**
   * True when text extraction was too sparse to trust and the document was read as
   * images. Character offsets are unreliable in that case, so citations degrade to
   * page-level and the reader is told so.
   */
  readonly readAsScan: boolean;
  readonly generatedAt: string;
}

/**
 * What the classifier decided, when it decided the input is not a contract.
 *
 * A refusal is a first-class outcome rather than an error: a supermarket receipt is
 * not a failure of the system, and telling the reader plainly what they uploaded is
 * more useful than a stack trace or an empty report.
 */
export interface NotADocumentResult {
  readonly kind: 'not_a_document';
  readonly reason: string;
}

export type AnalysisOutcome = { readonly kind: 'report'; readonly report: AnalysisReport } | NotADocumentResult;
