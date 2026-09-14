import { describe, expect, it } from 'vitest';

import { classifyGenAiError } from '@/server/genai/errors';


/**
 * A call that never comes back.
 *
 * This is not hypothetical: on 14 September a deployed revision answered every analysis
 * with a bare 504 because the SDK had no timeout, the request sat until Cloud Run's own
 * 300-second ceiling killed it, and the ladder in `gateway.ts` never got control back to
 * try another pair. The reader saw a blank gateway error with no message and no log line.
 *
 * The classification matters as much as the timeout. `unavailable` is penalised in the
 * key pool and retried on the next pair; `rate_limited` is written into the process-wide
 * exhaustion memory for an hour. Filing a timeout under the latter would let one slow
 * minute blacklist a working key for the rest of the hour.
 */
describe('a model call that timed out', () => {
  it.each([
    ['request timed out after 120000ms'],
    ['The operation was aborted'],
    ['AbortError: signal is aborted without reason'],
  ])('is transient rather than a quota verdict: %s', (message) => {
    const error = classifyGenAiError(new Error(message), 'gemini-3.8-flash');

    expect(error.failure).toBe('unavailable');
    expect(error.retryable).toBe(true);
  });

  it('still reads an explicit 429 as quota, not as a timeout', () => {
    // Guards the ordering: the message sniff runs after the status check, so a 429 whose
    // body happens to mention a timeout is still a quota verdict.
    const error = classifyGenAiError(
      Object.assign(new Error('rate limit exceeded; request timeout'), { status: 429 }),
      'gemini-3.8-flash',
    );

    expect(error.failure).toBe('rate_limited');
  });
});
