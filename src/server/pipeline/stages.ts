import 'server-only';
import type { z } from 'zod';

import type { CanonicalDocument } from '../../core/document/types';
import type { KnowledgeBase } from '../../core/rubric/types';
import type { EnforceabilityTable } from '../../core/enforceability/types';
import { DocumentClassificationSchema, type DocumentClassification } from '../../schemas/classification';
import type { DocumentType, OutputLanguage, ReadingLevel } from '../../schemas/document-type';
import { ExtractedFactsSchema, type ExtractedFacts } from '../../schemas/extracted-facts';
import { FindingsPayloadSchema, type RawFinding } from '../../schemas/finding';
import { QaAnswerSchema, type QaAnswer } from '../../schemas/qa-answer';
import type { ContextPart, StructuredRequest } from '../genai/interactions';
import { MODELS } from '../genai/models';
import { buildClassifyInstruction, CLASSIFY_DOCUMENT_SYSTEM } from '../prompts/classify-document';
import { buildExtractFactsInstruction, EXTRACT_FACTS_SYSTEM } from '../prompts/extract-facts';
import { buildFindClausesInstruction, FIND_CLAUSES_SYSTEM } from '../prompts/find-clauses';
import { ANSWER_QUESTION_SYSTEM, buildAnswerQuestionInstruction } from '../prompts/answer-question';

/**
 * The seam between the pipeline and the model.
 *
 * One method, so the test fake is fifteen lines and needs no mocking library. Every
 * stage below is a pure function of `(document, deps)` and is therefore exercisable
 * offline by replaying recorded output — which is what lets CI run the whole
 * orchestration with no API key and no network.
 */
export interface LlmGateway {
  structured<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<{ value: z.infer<TSchema>; model: string; cachedTokens: number | null }>;
}

export interface PipelineDeps {
  readonly llm: LlmGateway;
  readonly knowledge: KnowledgeBase;
  readonly enforceability: EnforceabilityTable;
  readonly clock: () => Date;
}

export interface AnalysisOptions {
  readonly language: OutputLanguage;
  readonly readingLevel: ReadingLevel;
  readonly maxFindings: number;
}

/**
 * The document, as the stable prefix of every request.
 *
 * Built once and reused across stages so Gemini's implicit context caching can hit:
 * the cache keys on a shared prefix, and only the trailing instruction differs
 * between the two extraction calls and every subsequent question.
 */
function documentContext(document: CanonicalDocument): readonly ContextPart[] {
  return [{ kind: 'text', text: document.text }];
}

export async function classifyDocument(
  document: CanonicalDocument,
  deps: PipelineDeps,
): Promise<DocumentClassification> {
  // Only the opening of the document is needed to tell a lease from an offer letter,
  // and sending the whole thing to the cheapest model would waste the context the
  // reasoning stages want cached.
  const opening = document.text.slice(0, 4000);

  const result = await deps.llm.structured({
    model: MODELS.cheap,
    schema: DocumentClassificationSchema,
    system: CLASSIFY_DOCUMENT_SYSTEM,
    context: [{ kind: 'text', text: opening }],
    instruction: buildClassifyInstruction(),
  });
  return result.value;
}

export async function extractFacts(
  document: CanonicalDocument,
  documentType: DocumentType,
  deps: PipelineDeps,
): Promise<ExtractedFacts> {
  const result = await deps.llm.structured({
    model: MODELS.reasoning,
    schema: ExtractedFactsSchema,
    system: EXTRACT_FACTS_SYSTEM,
    context: documentContext(document),
    instruction: buildExtractFactsInstruction(documentType),
    // The judgement this stage makes -- "absent" versus "unclear" -- decides whether a
    // missing-clause finding is reported at all, so it gets the full thinking budget.
    thinkingLevel: 'high',
  });
  return result.value;
}

export async function findClauses(
  document: CanonicalDocument,
  documentType: DocumentType,
  options: AnalysisOptions,
  deps: PipelineDeps,
): Promise<readonly RawFinding[]> {
  const result = await deps.llm.structured({
    model: MODELS.reasoning,
    schema: FindingsPayloadSchema,
    system: FIND_CLAUSES_SYSTEM,
    context: documentContext(document),
    instruction: buildFindClausesInstruction({
      documentType,
      language: options.language,
      readingLevel: options.readingLevel,
      maxFindings: options.maxFindings,
    }),
    // Copying a quote accurately needs less deliberation than deciding whether a
    // clause is truly absent, so this stage runs cheaper than fact extraction.
    thinkingLevel: 'medium',
  });
  return result.value.findings;
}

export async function answerQuestion(
  document: CanonicalDocument,
  question: string,
  language: OutputLanguage,
  deps: PipelineDeps,
): Promise<QaAnswer> {
  const result = await deps.llm.structured({
    model: MODELS.reasoning,
    schema: QaAnswerSchema,
    system: ANSWER_QUESTION_SYSTEM,
    context: documentContext(document),
    instruction: buildAnswerQuestionInstruction({ question, language }),
    // Every follow-up question reuses the same document prefix, so turns after the
    // first are served largely from cache.
    thinkingLevel: 'low',
  });
  return result.value;
}
