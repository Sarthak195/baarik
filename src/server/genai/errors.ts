import 'server-only';

/**
 * Failures the pipeline distinguishes.
 *
 * The distinction that matters is between a failure worth retrying on a smaller model
 * and one that will fail identically however many times it is repeated. Retrying a
 * schema violation wastes the user's time and the project's quota; not retrying a 429
 * throws away a request that would have succeeded a second later.
 */
export type GenAiFailure =
  /** Rate limited. Retryable, and the strongest signal to fall back to a cheaper model. */
  | 'rate_limited'
  /** Server-side fault. Retryable. */
  | 'unavailable'
  /** The request exceeded the model's context window. Retrying changes nothing. */
  | 'too_large'
  /** The response did not satisfy the schema. Retrying rarely helps; the prompt is wrong. */
  | 'invalid_output'
  /** Missing or rejected credentials. A deployment problem, not a runtime one. */
  | 'unauthenticated'
  | 'unknown';

export class GenAiError extends Error {
  readonly failure: GenAiFailure;
  readonly model: string;
  readonly retryable: boolean;

  constructor(failure: GenAiFailure, model: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GenAiError';
    this.failure = failure;
    this.model = model;
    this.retryable = failure === 'rate_limited' || failure === 'unavailable';
  }
}

/**
 * Classify an unknown thrown value.
 *
 * The SDK does not expose a stable error taxonomy, so this reads status codes and
 * falls back to message matching. Being wrong here is survivable in one direction
 * only: a misclassified retryable error costs one wasted attempt, while a
 * misclassified permanent error costs a retry loop against a paid API. Anything not
 * positively recognised is therefore treated as non-retryable.
 */
export function classifyGenAiError(error: unknown, model: string): GenAiError {
  if (error instanceof GenAiError) return error;

  const status = extractStatus(error);
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) return new GenAiError('rate_limited', model, message, { cause: error });
  if (status !== null && status >= 500) {
    return new GenAiError('unavailable', model, message, { cause: error });
  }
  if (status === 401 || status === 403) {
    return new GenAiError('unauthenticated', model, message, { cause: error });
  }

  const lowered = message.toLowerCase();
  if (lowered.includes('rate limit') || lowered.includes('quota')) {
    return new GenAiError('rate_limited', model, message, { cause: error });
  }
  if (lowered.includes('token') && lowered.includes('exceed')) {
    return new GenAiError('too_large', model, message, { cause: error });
  }

  return new GenAiError('unknown', model, message, { cause: error });
}

function extractStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.code === 'number') return candidate.code;
  return null;
}
