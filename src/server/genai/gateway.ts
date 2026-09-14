import 'server-only';
import type { z } from 'zod';

import type { KeyPool } from '../config/key-pool';
import { getGenAiClient } from './client';
import { GenAiError } from './errors';
import { isExhausted, pairKey, rememberExhausted } from './exhaustion';
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
 * enough to matter is longer than a person will sit in front of a page. What each walk
 * of the ladder learns is kept in `exhaustion.ts`, process-wide and with a TTL, so the
 * next request starts from what this one paid to find out.
 */
export interface GatewayResult<TValue> {
  readonly value: TValue;
  readonly model: ModelId;
  readonly cachedTokens: number | null;
  /** True when the first-choice model was unavailable and a substitute answered. */
  readonly degraded: boolean;
  /**
   * How many (model, key) pairs answered 429 while serving this request. Pairs the
   * process already knew were spent are skipped without a round trip and are not
   * counted, so a request served entirely from memory reports zero. A model discovered
   * to be retired is remembered too but not counted here: this figure is about quota,
   * which is what a degraded report has to be explained by.
   */
  readonly exhaustedPairs: number;
}

export interface GatewayOptions {
  readonly keys: KeyPool;
  /** Injected so tests can drive the ladder without a network. */
  readonly run?: typeof runStructured;
  /**
   * The wall clock, for the TTLs on the shared exhaustion memory. A parameter rather
   * than a `Date.now()` buried in the ladder, exactly as `checkRateLimit(headers, now)`
   * and `getReport(id, now)` take theirs: it makes "that ban has lapsed" arithmetic a
   * test can state, instead of something a suite has to install fake timers to reach.
   */
  readonly now: number;
}

export async function callWithFallback<TSchema extends z.ZodType>(
  request: StructuredRequest<TSchema>,
  options: GatewayOptions,
): Promise<GatewayResult<z.infer<TSchema>>> {
  const run = options.run ?? runStructured;

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

      // Known dead, from this request or from one served minutes ago — the memory in
      // `exhaustion.ts` spans the process. Skipping costs nothing; calling it costs a
      // round trip and moves the key to the back of the rotation for no reason.
      if (isExhausted(pair, options.now)) continue;

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

        // Spent for today, and the only failure here that the daily reset undoes.
        if (error.failure === 'rate_limited') {
          rememberExhausted(pair, 'rate_limited', options.now);
          exhaustedPairs += 1;
          options.keys.penalise(key);
          continue;
        }

        // A 5xx is usually the service rather than the credential, but it costs one
        // request to find out and the alternative is failing an analysis that the
        // next key would have served. Deliberately NOT remembered: a fault expected to
        // clear in seconds, written into a memory that lasts an hour, would outlive the
        // blip that caused it and make this process the outage. Demotion in the key
        // pool is the right-sized response, and it has already happened.
        if (error.failure === 'unavailable') {
          options.keys.penalise(key);
          continue;
        }

        // A retired model fails identically on every key, so stop cycling keys and let
        // the outer loop try the next model instead. Remembered against the pair that
        // saw it rather than against the model, because the keys are separate projects
        // and access is granted per project — banning the model everywhere on one 404
        // would refuse a model the other keys can still call. Its ban outlasts a
        // quota's: a retirement is not undone at midnight.
        if (error.failure === 'model_unavailable') {
          rememberExhausted(pair, 'model_unavailable', options.now);
          break;
        }

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
