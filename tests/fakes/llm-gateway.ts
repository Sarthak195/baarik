import type { z } from 'zod';

import type { StructuredRequest } from '@/server/genai/interactions';
import type { LlmGateway } from '@/server/pipeline/stages';
import { CLASSIFY_DOCUMENT_SYSTEM } from '@/server/prompts/classify-document';
import { EXTRACT_FACTS_SYSTEM } from '@/server/prompts/extract-facts';
import { FIND_CLAUSES_SYSTEM } from '@/server/prompts/find-clauses';
import {
  readGoldenRecording,
  type GoldenRecording,
  type GoldenStage,
} from '@/server/samples/golden';

/**
 * The other half of the offline guarantee.
 *
 * `tests/setup.ts` makes the network unreachable; this is what makes the whole pipeline
 * runnable anyway. `scripts/record-golden.ts` captured what each stage's model actually
 * said into `golden/llm/<id>.json`, and this replays it through the same `LlmGateway`
 * seam the product injects — so a test exercises classification, extraction, grounding,
 * scoring, triage, consistency and routing composed exactly as production composes
 * them, with no API key and no wall-clock variance.
 *
 * Everything here is deliberately loud. A fake that guesses, substitutes or silently
 * returns something plausible would let the golden test pass while verifying nothing,
 * which is worse than having no golden test at all.
 */

/**
 * Which stage a request belongs to.
 *
 * Matched by identity against the prompt constants, never by searching the system text
 * for a keyword. The three prompts share vocabulary, so a substring guess would answer
 * one stage with another's recording — and the pipeline would happily build a report
 * from it. Identity also means an edited prompt is an unrecognised prompt, which is the
 * correct outcome: the recording predates the edit.
 *
 * `scripts/record-golden.ts` keys its recordings with the identical three comparisons,
 * so the write and the replay cannot drift apart.
 */
function stageOf(system: string): GoldenStage | null {
  if (system === CLASSIFY_DOCUMENT_SYSTEM) return 'classification';
  if (system === EXTRACT_FACTS_SYSTEM) return 'facts';
  if (system === FIND_CLAUSES_SYSTEM) return 'findings';
  return null;
}

export class FakeLlmGateway implements LlmGateway {
  private readonly recording: GoldenRecording;
  private readonly called: GoldenStage[] = [];

  constructor(recording: GoldenRecording) {
    this.recording = recording;
  }

  /**
   * The stages the pipeline actually asked for, in the order it asked.
   *
   * Exposed because "the receipt was refused before extraction" is a claim about calls
   * that were never made, and an output-only assertion cannot see the two model
   * requests a wasteful pipeline would have spent getting to the same answer.
   */
  get stagesCalled(): readonly GoldenStage[] {
    return [...this.called];
  }

  structured<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<{ value: z.infer<TSchema>; model: string; cachedTokens: number | null }> {
    const stage = stageOf(request.system);
    if (stage === null) {
      throw new Error(
        `${this.describe()} has no recording for this request: its system instruction is ` +
          'none of CLASSIFY_DOCUMENT_SYSTEM, EXTRACT_FACTS_SYSTEM or FIND_CLAUSES_SYSTEM. ' +
          'Either a prompt changed and the recordings are stale, or a new stage needs ' +
          'recording — answering it with an existing stage would be a plausible lie.',
      );
    }

    // Recorded before anything can fail, so `stagesCalled` is what the pipeline ASKED
    // for rather than what it was successfully given — otherwise a stage that threw
    // would leave no trace of having been requested.
    this.called.push(stage);

    const stages = this.recording.stages;
    if (!Object.hasOwn(stages, stage)) {
      throw new Error(
        `${this.describe()} recorded no "${stage}" stage, so the pipeline reached a model ` +
          'call the recording says it never made. A refusal records classification alone; ' +
          'asking for anything more means the refusal was not honoured.',
      );
    }

    const recorded: unknown = stages[stage];
    // Through the CALLER's schema, exactly as the real gateway validates a live
    // response. Casting instead would type the replay by this file's beliefs about the
    // recording rather than by the contract the pipeline actually depends on, and a
    // recording that had drifted would surface as a confusing failure much later.
    const parsed = request.schema.safeParse(recorded);
    if (!parsed.success) {
      throw new Error(
        `${this.describe()} has a "${stage}" recording that no longer satisfies the stage's ` +
          `schema: ${parsed.error.message}. Re-record it with ` +
          '`npm run record:golden -- --only <id> --force` rather than editing it by hand.',
      );
    }

    const model = this.recording.models[stage];
    if (model === undefined) {
      throw new Error(
        `${this.describe()} records a "${stage}" value but not the model that produced it. ` +
          'A report that cannot name what generated it is not one this project will serve.',
      );
    }

    // Null rather than a number: nothing was cached because nothing was sent, and
    // inventing a hit count would put fiction into a field the report shows a reader.
    return Promise.resolve({ value: parsed.data, model, cachedTokens: null });
  }

  private describe(): string {
    return `The recording for "${this.recording.fixtureId}"`;
  }
}

/**
 * The gateway for one committed fixture.
 *
 * Missing is a failure rather than an empty replay: a gateway with nothing to say would
 * fail the first schema parse with a message about a malformed model response, which
 * points at the wrong problem entirely.
 */
export function replayGolden(id: string, root: string = process.cwd()): FakeLlmGateway {
  const recording = readGoldenRecording(id, root);
  if (recording === null) {
    throw new Error(
      `There is no golden/llm/${id}.json to replay. Record it with ` +
        `\`npm run record:golden -- --only ${id}\`; it needs a live key and spends two requests.`,
    );
  }
  return new FakeLlmGateway(recording);
}
