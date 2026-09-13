import 'server-only';
import type { z } from 'zod';

import type { KeyPool } from '../config/key-pool';
import { getGenAiClient } from './client';
import { GenAiError } from './errors';
import { runStructured, type StructuredRequest } from './interactions';
import { MODEL_LADDER, tierFor, type ModelId } from './models';

/**
 * The resilient gateway.
 *
 * Free-tier quota is counted per model per key. `gemini-3.8-flash` allows twenty
 * requests a day on one key — a figure Google no longer publishes, found by
 * exhausting it — and a full analysis spends two of them. One key is therefore ten
 * analyses, which would be gone by mid-morning on a judging day.
 *
 * But a sibling model on the *same* key has its own separate allowance. So the
 * recovery ladder walks both dimensions, cheapest first:
 *
 *   1. **Another key, same model.** Same quality, reader sees nothing.
 *   2. **The next model down, from the top key again.** Slightly less capable, its own
 *      quota, and the report names the model that answered rather than hiding it.
 *   3. **Fail honestly**, carrying the reason so the route can offer a worked sample
 *      instead of a stack trace.
 *
 * Six keys across four reasoning models is roughly twenty times the capacity of one
 * key on one model, for no money and no waiting.
 *
 * Retrying the same pair is never a strategy: the quota is daily, so any wait long
 * enough to matter is longer than a person will sit in front of a page.
 */
export interface GatewayResult<TValue> {
  readonly value: TValue;
  readonly model: ModelId;
  readonly cachedTokens: number | null;
  /** True when the first-choice model was unavailable and a substitute answered. */
  readonly degraded: boolean;
  /**
   * How many (model, key) pairs were newly discovered exhausted while serving this
   * request. Pairs already known from a previous call are skipped without a round
   * trip and are not counted, so a request served entirely from memory reports zero.
   */
  readonly exhaustedPairs: number;
}

export interface GatewayOptions {
  readonly keys: KeyPool;
  /** Injected so tests can drive the ladder without a network. */
  readonly run?: typeof runStructured;
  /**
   * Pairs already known exhausted, shared across requests in one process. Passing the
   * same Set between calls is what stops every request re-discovering this morning's
   * exhausted models one 429 at a time.
   */
  readonly exhausted?: Set<string>;
}

const pairKey = (model: ModelId, key: string): string => `${model}::${key.slice(-8)}`;

export async function callWithFallback<TSchema extends z.ZodType>(
  request: StructuredRequest<TSchema>,
  options: GatewayOptions,
): Promise<GatewayResult<z.infer<TSchema>>> {
  const run = options.run ?? runStructured;
  const exhausted = options.exhausted ?? new Set<string>();

  // Start at the caller's chosen model and walk down its tier. A caller naming a
  // model deep in the ladder gets the substitutes below it, never above.
  const ladder = MODEL_LADDER[tierFor(request.model)] as readonly ModelId[];
  const from = ladder.indexOf(request.model);
  const models: readonly ModelId[] = from === -1 ? [request.model, ...ladder] : ladder.slice(from);

  let exhaustedPairs = 0;
  let lastError: unknown;

  for (const [index, model] of models.entries()) {
    for (let attempt = 0; attempt < options.keys.size; attempt += 1) {
      const key = options.keys.next();
      const pair = pairKey(model, key);

      // Known dead for today. Skipping costs nothing; calling it costs a round trip
      // and moves the key to the back of the rotation for no reason.
      if (exhausted.has(pair)) continue;

      try {
        const result = await run(getGenAiClient(key), { ...request, model });
        return {
          value: result.value,
          model,
          cachedTokens: result.cachedTokens,
          degraded: index > 0,
          exhaustedPairs,
        };
      } catch (error) {
        lastError = error;
        if (!(error instanceof GenAiError)) throw error;

        if (error.failure === 'rate_limited') {
          exhausted.add(pair);
          exhaustedPairs += 1;
          options.keys.penalise(key);
          continue;
        }

        // A 5xx is usually the service rather than the credential, but it costs one
        // request to find out and the alternative is failing an analysis that the
        // next key would have served. Not recorded as exhausted: unlike a daily
        // quota, it is expected to clear on its own.
        if (error.failure === 'unavailable') {
          options.keys.penalise(key);
          continue;
        }

        // A retired model fails identically on every key, so stop cycling keys and
        // let the outer loop try the next model instead.
        if (error.failure === 'model_unavailable') break;

        // A malformed request or a schema violation is our bug and will reproduce
        // everywhere. Surfacing it immediately beats burning quota confirming it.
        throw error;
      }
    }
  }

  throw lastError instanceof GenAiError
    ? lastError
    : new GenAiError(
        'rate_limited',
        request.model,
        'Every model and key combination is exhausted for today.',
      );
}
