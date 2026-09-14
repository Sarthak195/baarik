import type { z } from 'zod';

import type { GatewayResult } from '@/server/genai/gateway';
import type { StructuredRequest } from '@/server/genai/interactions';
import type { LlmGateway } from '@/server/pipeline/stages';

/**
 * The seam that lets a route handler be called for real.
 *
 * `tests/fakes/llm-gateway.ts` replaces the gateway where the pipeline takes one as a
 * parameter, which is everywhere except the two places that matter most: `/analyze` and
 * `/api/ask` build their own `LlmGateway` from `callWithFallback`, because the ladder
 * of (model, key) pairs is a property of the deployment rather than of the analysis.
 * That is the right design and it is also why no test had ever invoked either handler —
 * there was no way in without either a key or a mocking layer nobody had written.
 *
 * This is that layer, and it is deliberately thin. `vi.mock('@/server/genai/gateway')`
 * points at this module, so the route resolves its own gateway exactly as it does in
 * production and the request arrives here instead of at Google. Whatever the test
 * installed answers it — normally `replayGolden(id)`, so the reply is the recorded
 * output of a real model rather than something invented for the occasion.
 *
 * Two things it will not do, both for the same reason — a fake that guesses lets a test
 * pass while verifying nothing:
 *
 *   - It refuses a request when no gateway is installed, rather than returning an empty
 *     answer that would surface much later as a confusing schema failure.
 *   - It records every request before answering it, so a test can assert what the model
 *     was actually shown. "The upload reached the pipeline" is a claim about the bytes
 *     in front of the model, and no assertion on the response can see them.
 */

/** One request the pipeline made, flattened to the strings a test can assert on. */
export interface SentRequest {
  /** Identifies the stage: the system instruction is a module constant per stage. */
  readonly system: string;
  /** The document, as the stage put it in front of the model. */
  readonly context: string;
  readonly instruction: string;
}

let installed: LlmGateway | null = null;
const sent: SentRequest[] = [];

/** Answer the next requests with this gateway. Call it in `beforeEach`, not at import. */
export function installGateway(gateway: LlmGateway): void {
  installed = gateway;
}

/** Forget the installed gateway and every recorded request. */
export function resetGateway(): void {
  installed = null;
  sent.length = 0;
}

/**
 * What the pipeline sent, in order.
 *
 * The primary use is the empty case: a route that refuses an upload, or answers a
 * question about a report that is gone, must not have spent a request of a twenty-a-day
 * allowance finding that out — and only this can show that it did not.
 */
export function sentRequests(): readonly SentRequest[] {
  return [...sent];
}

/**
 * The stand-in for `@/server/genai/gateway`'s export of the same name.
 *
 * The real signature is `(request, options)`, where `options` carries the key pool and
 * the clock. The second parameter is deliberately not declared: nothing here consults a
 * pool, and accepting one would invite a test to assert against a value that never
 * leaves this file. A function of lower arity substitutes for one of higher arity, so
 * the route's call site is unaffected.
 */
export function callWithFallback<TSchema extends z.ZodType>(
  request: StructuredRequest<TSchema>,
): Promise<GatewayResult<z.infer<TSchema>>> {
  // Recorded before anything can fail, so the log is what the pipeline ASKED for rather
  // than what it was successfully given.
  sent.push({
    system: request.system,
    context: request.context.map((part) => part.text ?? '').join('\n'),
    instruction: request.instruction,
  });

  const gateway = installed;
  if (gateway === null) {
    return Promise.reject(
      new Error(
        'A route handler reached the model gateway with no fake installed. Call ' +
          '`installGateway(replayGolden(id))` in the test, or assert that this path ' +
          'never calls a model — answering it with a plausible reply would spend nothing ' +
          'and prove nothing.',
      ),
    );
  }

  // The model name comes from the recording, so a replayed report still names what
  // produced it. The ladder's own bookkeeping is reported as untouched because no ladder
  // was walked: a replay must not claim it survived a substitution it never faced.
  return gateway
    .structured(request)
    .then((result) => ({ ...result, degraded: false, exhaustedPairs: 0 }));
}
