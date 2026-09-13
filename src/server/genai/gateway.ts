import 'server-only';
import type { z } from 'zod';

import type { KeyPool } from '../config/key-pool';
import { getGenAiClient } from './client';
import { GenAiError } from './errors';
import { runStructured, type StructuredRequest } from './interactions';
import { MODELS, type ModelId } from './models';

/**
 * The resilient gateway.
 *
 * The free tier allows **20 requests per day per key** on `gemini-3.8-flash` — a
 * figure Google no longer publishes and that had to be discovered by exhausting it.
 * A full analysis spends two of those, so one key is ten analyses and a demo without
 * degradation would be dead by mid-morning on a judging day.
 *
 * So a failure is answered in the order that costs least:
 *
 *   1. **Another key.** A quota is per key, so the same request on the next key is
 *      the cheapest possible recovery and the reader sees nothing.
 *   2. **A weaker model.** Once every key is exhausted for the reasoning tier, the
 *      fallback tier has its own separate quota. The answer is less considered, and
 *      the report says which model produced it rather than hiding the substitution.
 *   3. **Fail honestly.** When nothing is left, the error carries the failure kind so
 *      the route can say "we are rate limited, here is a fully worked sample" rather
 *      than showing a stack trace.
 *
 * Retrying the same key on the same model is deliberately not a strategy: the quota
 * is daily, so a wait long enough to matter is longer than anyone will sit in front
 * of a page.
 */
export interface GatewayResult<TValue> {
  readonly value: TValue;
  readonly model: ModelId;
  readonly cachedTokens: number | null;
  /** True when the reasoning tier was exhausted and a weaker model answered. */
  readonly degraded: boolean;
  /** Keys that returned 429 during this call, for the health endpoint to surface. */
  readonly exhaustedKeys: number;
}

export interface GatewayOptions {
  readonly keys: KeyPool;
  /** Injected so tests can drive the fallback path without a network. */
  readonly run?: typeof runStructured;
}

export async function callWithFallback<TSchema extends z.ZodType>(
  request: StructuredRequest<TSchema>,
  options: GatewayOptions,
): Promise<GatewayResult<z.infer<TSchema>>> {
  const run = options.run ?? runStructured;
  const attempts: ModelId[] =
    request.model === MODELS.fallback ? [request.model] : [request.model, MODELS.fallback];

  let exhaustedKeys = 0;
  let lastError: unknown;

  for (const [index, model] of attempts.entries()) {
    // Every key gets one attempt at this model before the model is given up on.
    for (let attempt = 0; attempt < options.keys.size; attempt += 1) {
      const key = options.keys.next();
      try {
        const result = await run(getGenAiClient(key), { ...request, model });
        return {
          value: result.value,
          model,
          cachedTokens: result.cachedTokens,
          degraded: index > 0,
          exhaustedKeys,
        };
      } catch (error) {
        lastError = error;
        if (!(error instanceof GenAiError)) throw error;

        if (error.failure === 'rate_limited') {
          // Per-key quota, so move this key to the back and try the next one.
          options.keys.penalise(key);
          exhaustedKeys += 1;
          continue;
        }

        // A retired model, a malformed request or a schema violation will fail
        // identically on every key. Stop cycling keys and let the model loop decide
        // whether a different tier is worth trying.
        if (error.failure === 'model_unavailable') break;
        throw error;
      }
    }
  }

  throw lastError instanceof GenAiError
    ? lastError
    : new GenAiError('rate_limited', request.model, 'Every key and model tier is exhausted.');
}
