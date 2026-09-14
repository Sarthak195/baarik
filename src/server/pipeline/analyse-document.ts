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
 * Three model calls -- a cheap classification, then two reasoning calls run
 * concurrently -- and everything else offline. Steps 3 onward take the model's raw
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

  // Every stage calls the model through this, so `modelsUsed` records what actually
  // answered rather than what was asked for. It used to be the single hardcoded string
  // `gemini-3.8-flash`, which was wrong twice over: the ladder in `gateway.ts` substitutes
  // a sibling model when one meets its daily quota, and classification runs on the cheap
  // model and was never recorded at all. `gateway.ts` states as a design principle that
  // "the report names the model that answered rather than hiding it"; this is what makes
  // that true.
  const observed: PipelineDeps = {
    ...deps,
    llm: {
      structured: async (request) => {
        const result = await deps.llm.structured(request);
        models.add(result.model);
        return result;
      },
    },
  };

  const classification = await timed(timings, 'classify', () =>
    classifyDocument(input.document, observed),
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
  // from Gemini's implicit cache. Running them concurrently rather than in series is
  // what keeps the reasoning stage to the slower of the two instead of their sum.
  //
  // It does not make the analysis fast. A measured run is 163s in `asia-south1`, and
  // nothing streams -- `interactions.ts` sends `stream: false` and the route awaits the
  // whole pipeline before its 303 -- so nothing reaches the screen until it finishes.
  // The wall clock a reader actually feels is addressed by the analysis cache, which
  // serves the same document again in 0.14s, not by this.
  const [facts, rawFindings] = await timed(timings, 'extract', () =>
    Promise.all([
      extractFacts(input.document, documentType, observed),
      findClauses(input.document, documentType, input.options, observed),
    ]),
  );
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
        // Sorted, because the two reasoning calls race inside `Promise.all` and
        // whichever answers first would otherwise decide the order of a committed field.
        modelsUsed: [...models].sort(),
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
