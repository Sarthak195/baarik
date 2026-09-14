import 'server-only';

import { detectInconsistencies } from '../../core/consistency/detect';
import type { CanonicalDocument } from '../../core/document/types';
import { triageEnforceability } from '../../core/enforceability/triage';
import { verifyFindings } from '../../core/grounding/verify';
import type { ForumTable, LimitationTable, RemedySituation } from '../../core/remedies/types';
import { routeNextSteps } from '../../core/remedies/router';
import type { AnalysisOutcome } from '../../core/report/types';
import { buildFactView } from '../../core/risk/fact-view';
import { scoreDocument } from '../../core/risk/engine';
import { LIMITS } from '../config/limits';
import type { DocumentType } from '../../schemas/document-type';
import type { AnalysisOptions, PipelineDeps } from './stages';
import { classifyDocument, extractFacts, findClauses } from './stages';

/**
 * The orchestrator.
 *
 * Two model calls, then everything else offline. Steps 3 onward take the model's raw
 * output all the way to the reader's answer with no network access and no
 * non-determinism — which is what lets the whole composition be tested by replaying
 * recorded output, and what makes the committed golden reports assertable exactly.
 */
export interface AnalyseInput {
  readonly document: CanonicalDocument;
  readonly options: AnalysisOptions;
  readonly forums: ForumTable;
  readonly limitation: LimitationTable;
  readonly reportId: string;
  readonly situation?: RemedySituation;
  readonly readAsScan?: boolean;
  /**
   * The document type the reader chose on the landing form, if they chose one.
   *
   * Absent means "let Baarik work it out", which is the form's default and the only
   * thing the golden recordings ever pass — so a recorded report is unaffected by this
   * field existing.
   */
  readonly declaredType?: DocumentType | undefined;
}

export async function analyseDocument(
  input: AnalyseInput,
  deps: PipelineDeps,
): Promise<AnalysisOutcome> {
  const timings: Record<string, number> = {};
  const models = new Set<string>();
  const startedAt = deps.clock();

  const classification = await timed(timings, 'classify', () =>
    classifyDocument(input.document, deps),
  );

  // Refusing is a first-class outcome, not an error. A supermarket receipt is not a
  // failure of the system, and a risk score for a document with no terms would
  // misrepresent what this tool can do.
  if (!classification.isLegalDocument) {
    return {
      kind: 'not_a_document',
      reason: classification.notLegalReason ?? 'This does not look like a legal agreement.',
    };
  }

  // The reader's own answer wins over the model's guess, because they are holding the
  // document and the model has seen its first four thousand characters. The type decides
  // which rubric rules apply, which baseline is compared against and which absences are
  // worth checking, so a lease read as an offer letter is scored against the wrong
  // questions entirely.
  //
  // The refusal above is deliberately NOT overridable. "Is this an agreement at all" and
  // "which kind of agreement is it" are different questions, and someone who picks a type
  // and then attaches the wrong file is exactly who needs to be told they uploaded a
  // supermarket receipt.
  const documentType = input.declaredType ?? classification.documentType;

  // Both calls share the identical document prefix, so the second is served largely
  // from Gemini's implicit cache. Running them concurrently also halves the wall
  // clock, which is what keeps a first finding on screen inside ten seconds.
  const [facts, rawFindings] = await timed(timings, 'extract', () =>
    Promise.all([
      extractFacts(input.document, documentType, deps),
      findClauses(input.document, documentType, input.options, deps),
    ]),
  );
  models.add('gemini-3.8-flash');

  // ---- Everything below is pure, offline and deterministic. ----

  const verification = verifyFindings(input.document, rawFindings);
  const { view } = buildFactView(input.document, facts);

  const risk = scoreDocument({
    facts: view,
    knowledge: deps.knowledge,
    language: input.options.language,
  });

  const enforceability = triageEnforceability({
    facts: view,
    findings: verification.grounded,
    table: deps.enforceability,
    documentType,
  });

  const inconsistencies = detectInconsistencies(input.document);

  const nextSteps = routeNextSteps({
    facts: view,
    drivers: risk.drivers,
    verdicts: enforceability,
    forums: input.forums,
    limitation: input.limitation,
    today: deps.clock(),
    ...(input.situation === undefined ? {} : { situation: input.situation }),
  });

  return {
    kind: 'report',
    report: {
      reportId: input.reportId,
      documentHash: input.document.hash,
      documentType,
      language: input.options.language,
      risk,
      findings: verification.grounded,
      rejected: verification.rejected,
      grounding: verification.stats,
      enforceability,
      inconsistencies,
      nextSteps,
      meta: {
        rubricVersion: deps.knowledge.version,
        modelsUsed: [...models],
        stageTimingsMs: timings,
        truncated: input.document.truncated,
        readAsScan: input.readAsScan ?? false,
        generatedAt: startedAt.toISOString(),
      },
    },
  };
}

/**
 * Time a stage without letting the measurement change the result.
 *
 * Timings are reported to the reader as "analysed in 13.4s", which is a modest
 * honesty about how long the work took rather than a performance claim.
 */
async function timed<T>(
  into: Record<string, number>,
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    into[name] = Math.round(performance.now() - started);
  }
}

/** Re-exported so a route handler does not need to reach into config for one number. */
export const MAX_FINDINGS = LIMITS.maxFindings;
