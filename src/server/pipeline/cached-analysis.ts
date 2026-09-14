import 'server-only';

import { randomUUID } from 'node:crypto';

import type { AnalysisOutcome } from '../../core/report/types';
import { analysisCache, analysisCacheKey } from '../store/analysis-cache';
import { analyseDocument, type AnalyseInput } from './analyse-document';
import type { PipelineDeps } from './stages';

/**
 * `analyseDocument`, with the model calls skipped when the identical question was asked
 * recently.
 *
 * A wrapper rather than a change to the pipeline, because the pipeline is where the
 * analysis is defined and this is a fact about the deployment: the cache exists because
 * the free tier allows roughly twenty requests per model per key per day and one analysis
 * spends three of them. Keeping it out here means the orchestration stays readable and
 * the golden-report tests keep exercising the real thing rather than a cache.
 */
export interface CachedAnalysis {
  readonly outcome: AnalysisOutcome;
  /** True when no model was called. Reported in the log line, never to the reader. */
  readonly cached: boolean;
}

export async function analyseDocumentCached(
  input: AnalyseInput,
  deps: PipelineDeps,
  now: number,
): Promise<CachedAnalysis> {
  const key = analysisCacheKey({
    documentHash: input.document.hash,
    language: input.options.language,
    readingLevel: input.options.readingLevel,
    declaredType: input.declaredType,
  });

  const hit = analysisCache.get(key, now);
  if (hit !== null) return { outcome: withFreshId(hit, input.reportId), cached: true };

  const outcome = await analyseDocument(input, deps);
  analysisCache.put(key, outcome, now);
  return { outcome, cached: false };
}

/**
 * A cached report keeps its findings and loses its identity.
 *
 * The report id is the URL someone is reading, minted per request by `randomUUID`.
 * Serving a second reader the first reader's id would put two people on one address for
 * no benefit — and `/api/ask` redeems answer tokens against a report id, so sharing one
 * would let a question asked about one visit surface on another's page.
 */
function withFreshId(outcome: AnalysisOutcome, reportId: string): AnalysisOutcome {
  if (outcome.kind !== 'report') return outcome;
  return { ...outcome, report: { ...outcome.report, reportId: reportId || randomUUID() } };
}
