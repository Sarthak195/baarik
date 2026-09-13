import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { DocumentClassificationSchema } from '@/schemas/classification';
import type { StructuredRequest } from '@/server/genai/interactions';
import { MODELS } from '@/server/genai/models';
import { ANSWER_QUESTION_SYSTEM } from '@/server/prompts/answer-question';
import { CLASSIFY_DOCUMENT_SYSTEM } from '@/server/prompts/classify-document';
import { EXTRACT_FACTS_SYSTEM } from '@/server/prompts/extract-facts';
import { GOLDEN_CLOCK, type GoldenRecording } from '@/server/samples/golden';

import { FakeLlmGateway, replayGolden } from '../fakes/llm-gateway';

/**
 * The fake's failures are what make `reports.test.ts` mean anything.
 *
 * A replaying gateway that guessed a stage, or handed back a recording without checking
 * it still fits the schema, would reproduce a golden report while verifying nothing
 * about the pipeline — the worst possible outcome for the one test that covers the
 * whole composition. So the refusals are tested directly rather than assumed.
 */

function requestWith<TSchema extends z.ZodType>(
  system: string,
  schema: TSchema,
): StructuredRequest<TSchema> {
  return {
    model: MODELS.cheap,
    schema,
    system,
    context: [{ kind: 'text', text: 'The tenant shall not sublet the premises.' }],
    instruction: 'Decide what this document is.',
  };
}

describe('FakeLlmGateway — routing a request to a recorded stage', () => {
  it('answers a recognised system instruction with that stage, and names the model', async () => {
    const gateway = replayGolden('grocery-bill');

    const result = await gateway.structured(
      requestWith(CLASSIFY_DOCUMENT_SYSTEM, DocumentClassificationSchema),
    );

    expect(result.value.isLegalDocument).toBe(false);
    expect(result.model).toBe('gemini-3.1-flash-lite');
    // Nothing was sent, so nothing was served from cache. Reporting a hit count here
    // would put a number into a report that describes a request that never happened.
    expect(result.cachedTokens).toBeNull();
    expect(gateway.stagesCalled).toEqual(['classification']);
  });

  it('refuses a system instruction it does not recognise rather than guessing', () => {
    // A real prompt from this codebase that no fixture records: the question-answering
    // stage. Matching on a keyword instead of identity would find "document" in it and
    // confidently hand back a classification.
    const gateway = replayGolden('grocery-bill');

    expect(() =>
      gateway.structured(requestWith(ANSWER_QUESTION_SYSTEM, DocumentClassificationSchema)),
    ).toThrow(/no recording for this request/i);
  });

  it('refuses a stage the recording does not contain', () => {
    const gateway = replayGolden('grocery-bill');

    // The receipt was refused at classification, so extraction was never recorded.
    // Inventing an empty answer here would let a pipeline that wasted two model calls
    // on a grocery bill pass the golden test.
    expect(() =>
      gateway.structured(requestWith(EXTRACT_FACTS_SYSTEM, DocumentClassificationSchema)),
    ).toThrow(/recorded no "facts" stage/);
  });

  it('refuses a recording that no longer satisfies the stage schema', () => {
    const drifted: GoldenRecording = {
      fixtureId: 'drifted',
      recordedAt: GOLDEN_CLOCK().toISOString(),
      models: { classification: 'gemini-3.1-flash-lite' },
      stages: { classification: { isLegalDocument: 'probably' } },
    };

    // Parsing through the caller's schema rather than casting is what turns a stale
    // recording into a named failure instead of an `undefined` surfacing three stages
    // later as a risk score nobody can explain.
    expect(() =>
      new FakeLlmGateway(drifted).structured(
        requestWith(CLASSIFY_DOCUMENT_SYSTEM, DocumentClassificationSchema),
      ),
    ).toThrow(/no longer satisfies/);
  });

  it('says how to record a fixture that has none', () => {
    expect(() => replayGolden('no-such-fixture')).toThrow(/golden\/llm\/no-such-fixture\.json/);
  });
});
