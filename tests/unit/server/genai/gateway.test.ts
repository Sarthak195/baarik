import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { KeyPool } from '@/server/config/key-pool';
import { GenAiError, type GenAiFailure } from '@/server/genai/errors';
import {
  clearExhausted,
  isExhausted,
  pairKey,
  QUOTA_TTL_MS,
  trackedPairs,
} from '@/server/genai/exhaustion';
import { callWithFallback } from '@/server/genai/gateway';
import type { runStructured, StructuredRequest } from '@/server/genai/interactions';
import {
  MODELS,
  MODEL_LADDER,
  tierFor,
  type LadderTier,
  type ModelId,
} from '@/server/genai/models';

// See key-pool.test.ts: `server-only` throws outside a React Server Component and vitest
// is not one. Hoisted above the imports so the marker is harmless when gateway.ts loads.
vi.mock('server-only', () => ({}));

/**
 * The gateway hands `run` a CLIENT, never the key it chose, so the only way a test can
 * see which key an attempt actually used is to make the client carry that identity.
 *
 * This stand-in mints one object per call and remembers which key built it. It is not
 * a network client and has no methods: the fake `run` below never calls it, it only
 * asks this map who it belongs to. Replacing the module also keeps the Gemini SDK out
 * of the suite entirely, which is the offline guarantee in tests/setup.ts.
 */
const KEY_BEHIND_CLIENT = vi.hoisted(() => new Map<object, string>());

vi.mock('@/server/genai/client', () => ({
  getGenAiClient: (apiKey: string) => {
    const client = {};
    KEY_BEHIND_CLIENT.set(client, apiKey);
    return client;
  },
  resetGenAiClient: () => {
    KEY_BEHIND_CLIENT.clear();
  },
}));

// The ladder is read from the source rather than retyped, so renaming a model id moves
// these tests with it instead of silently testing a model that no longer exists.
const [BEST, SECOND, THIRD, LAST_RESORT] = MODEL_LADDER.reasoning;
const [CHEAPEST, CHEAP_SECOND] = MODEL_LADDER.cheap;

/** A model id no ladder contains, standing in for one a caller invented. */
const UNLISTED = 'gemini-9.9-experimental';

// Distinct in their last eight characters, because that is the slice the gateway uses
// to name a (model, key) pair without writing a credential into a log line.
const KEY_A = 'key-alpha-1';
const KEY_B = 'key-bravo-2';
const KEY_C = 'key-charlie-3';

const VERDICT = z.object({ verdict: z.string() });

/**
 * The clock the gateway is given. It is a parameter rather than `Date.now()` because the
 * exhaustion memory expires bans against it, and a TTL boundary should be arithmetic in
 * a test rather than a fake timer.
 */
const NOW = 1_757_800_000_000;
const MINUTE = 60_000;

// The memory the ladder writes to spans the process, which is the whole point of it and
// also the one thing that could carry state between these tests.
beforeEach(() => {
  clearExhausted();
});

function analysisRequest(model: ModelId): StructuredRequest<typeof VERDICT> {
  return {
    model,
    schema: VERDICT,
    system: 'You explain Indian contracts in plain language.',
    context: [{ kind: 'text', text: 'The tenant shall not sublet the premises.' }],
    instruction: 'Name the obligation this clause creates.',
  };
}

/** One (model, key) the gateway actually dialled. */
interface Attempt {
  readonly model: ModelId;
  readonly key: string;
}

type Outcome =
  | { readonly kind: 'answers' }
  | { readonly kind: 'fails'; readonly failure: GenAiFailure }
  | { readonly kind: 'breaks'; readonly error: Error };

const ANSWERS: Outcome = { kind: 'answers' };
const RATE_LIMITED: Outcome = { kind: 'fails', failure: 'rate_limited' };
const RETIRED: Outcome = { kind: 'fails', failure: 'model_unavailable' };

interface FakeGemini {
  readonly run: typeof runStructured;
  /** Every (model, key) pair the gateway attempted, in the order it attempted them. */
  readonly attempts: readonly Attempt[];
}

/**
 * A `run` with the real signature and no network behind it.
 *
 * The outcome is decided from the observed pair rather than from a call counter, so a
 * scenario reads as "this key is out of quota on this model" — the thing the ladder
 * exists to survive — instead of "the third call fails".
 */
function fakeGemini(decide: (attempt: Attempt) => Outcome): FakeGemini {
  const attempts: Attempt[] = [];

  const run: typeof runStructured = (client, request) => {
    const key = KEY_BEHIND_CLIENT.get(client);
    if (key === undefined) {
      return Promise.reject(new Error('The gateway used a client this fake never made.'));
    }

    const attempt: Attempt = { model: request.model, key };
    attempts.push(attempt);

    const outcome = decide(attempt);
    if (outcome.kind === 'breaks') return Promise.reject(outcome.error);
    if (outcome.kind === 'fails') {
      return Promise.reject(
        new GenAiError(outcome.failure, request.model, `fake ${outcome.failure}`),
      );
    }

    return Promise.resolve({
      // Parsed through the caller's own schema, so a fake answer is as valid as a real
      // one and `value` is typed by the request rather than by this file.
      value: request.schema.parse({ verdict: `answered by ${request.model}` }),
      model: request.model,
      cachedTokens: 128,
    });
  };

  return { run, attempts };
}

/** The value a rejected call threw, so the assertion can be about the failure itself. */
function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error('Expected the gateway to give up, but it returned a result.');
    },
    (cause: unknown) => cause,
  );
}

function genAiErrorOf(thrown: unknown): GenAiError {
  if (!(thrown instanceof GenAiError)) {
    throw new Error(`Expected a GenAiError, got ${String(thrown)}`);
  }
  return thrown;
}

const modelsTried = (gemini: FakeGemini): readonly ModelId[] =>
  gemini.attempts.map((attempt) => attempt.model);

/**
 * The ladder is the difference between a demo that degrades in public and one that
 * returns 500s. Every test below asserts on the pairs the gateway actually dialled,
 * because the ordering IS the behaviour: preferring capability over convenience is
 * only real if the better model is exhausted across all keys before anything cheaper
 * is asked.
 */
describe('callWithFallback — walking the ladder', () => {
  it('names the model that was asked for and claims no degradation when the first key answers', async () => {
    const gemini = fakeGemini(() => ANSWERS);
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    const result = await callWithFallback(analysisRequest(BEST), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    expect(result.model).toBe(BEST);
    expect(result.degraded).toBe(false);
    expect(result.exhaustedPairs).toBe(0);
    expect(result.cachedTokens).toBe(128);
    expect(result.value.verdict).toBe(`answered by ${BEST}`);
    expect(gemini.attempts).toEqual([{ model: BEST, key: KEY_A }]);
  });

  it('spends every key on the best model before it will accept a lesser one', async () => {
    // Only the last key in the rotation has quota left on the best model.
    const gemini = fakeGemini(({ model, key }) =>
      model === BEST && key !== KEY_C ? RATE_LIMITED : ANSWERS,
    );
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    const result = await callWithFallback(analysisRequest(BEST), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    // A rate limit on one key is a fact about that key, not about the model. Downgrading
    // on it would cost the reader quality that two other keys could still have bought.
    expect(result.model).toBe(BEST);
    expect(result.degraded).toBe(false);
    expect(result.exhaustedPairs).toBe(2);
    expect(gemini.attempts).toEqual([
      { model: BEST, key: KEY_A },
      { model: BEST, key: KEY_B },
      { model: BEST, key: KEY_C },
    ]);
  });

  it('drops one rung when no key can serve the best model, and says which model answered', async () => {
    const gemini = fakeGemini(({ model }) => (model === BEST ? RATE_LIMITED : ANSWERS));
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    const result = await callWithFallback(analysisRequest(BEST), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    // Reporting the requested model here would make the report dishonest about what
    // produced it, which is the one thing a substitution must never cost.
    expect(result.model).toBe(SECOND);
    expect(result.degraded).toBe(true);
    expect(result.exhaustedPairs).toBe(3);
    expect(modelsTried(gemini)).toEqual([BEST, BEST, BEST, SECOND]);
    // One full round of 429s leaves the pool in its starting order, so the substitute is
    // offered the preferred key rather than the one that failed most recently.
    expect(gemini.attempts.at(-1)?.key).toBe(KEY_A);
  });

  it('offers a caller who named a mid-ladder model only the models below it', async () => {
    const gemini = fakeGemini(({ model }) => (model === THIRD ? RATE_LIMITED : ANSWERS));
    const keys = new KeyPool([KEY_A, KEY_B]);

    const result = await callWithFallback(analysisRequest(THIRD), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    // Asking for a cheap model is a budget decision. Silently escalating to a dearer one
    // would spend quota the caller deliberately declined to spend.
    expect(result.model).toBe(LAST_RESORT);
    expect(result.degraded).toBe(true);
    expect(modelsTried(gemini)).toEqual([THIRD, THIRD, LAST_RESORT]);
    expect(modelsTried(gemini)).not.toContain(BEST);
    expect(modelsTried(gemini)).not.toContain(SECOND);
  });

  it('keeps a cheap-tier request on the cheap ladder', async () => {
    const gemini = fakeGemini(({ model }) => (model === CHEAPEST ? RATE_LIMITED : ANSWERS));
    const keys = new KeyPool([KEY_A, KEY_B]);

    const result = await callWithFallback(analysisRequest(MODELS.cheap), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    expect(result.model).toBe(CHEAP_SECOND);
    expect(modelsTried(gemini)).toEqual([CHEAPEST, CHEAPEST, CHEAP_SECOND]);
  });

  it('tries an unlisted model first, then the reasoning ladder beneath it', async () => {
    // A model id that is not on any ladder — a newly announced one, say — is still
    // honoured before the known-good substitutes are reached for.
    const gemini = fakeGemini(({ model }) => (model === UNLISTED ? RATE_LIMITED : ANSWERS));
    const keys = new KeyPool([KEY_A, KEY_B]);

    const result = await callWithFallback(analysisRequest(UNLISTED), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    expect(result.model).toBe(BEST);
    expect(result.degraded).toBe(true);
    expect(modelsTried(gemini)).toEqual([UNLISTED, UNLISTED, BEST]);
  });
});

describe('tierFor', () => {
  const cases: readonly (readonly [ModelId, LadderTier])[] = [
    [MODELS.cheap, 'cheap'],
    ['gemini-3.5-flash-lite', 'cheap'],
    // `gemini-3.5-flash` is the last rung of BOTH ladders. Reasoning is checked first,
    // so naming the reasoning tier's designated fallback is treated as the capable
    // model it is rather than demoted into a ladder it happens to also terminate.
    [MODELS.fallback, 'reasoning'],
    [MODELS.reasoning, 'reasoning'],
    ['gemini-3.7-flash', 'reasoning'],
    ['gemini-3.6-flash', 'reasoning'],
    // An unrecognised id is treated as reasoning work. That is the safer default: a
    // cheap substitute for a hard question is a worse answer than a slower one.
    [UNLISTED, 'reasoning'],
  ];

  for (const [model, tier] of cases) {
    it(`routes ${model} to the ${tier} ladder`, () => {
      expect(tierFor(model)).toBe(tier);
    });
  }
});

/**
 * Quota is daily, so exhaustion discovered at ten in the morning is still true at four
 * in the afternoon. Remembering it is what stops every later request paying a round
 * trip to learn the same thing again.
 */
describe('callWithFallback — remembering what is spent', () => {
  // A fresh pool per call, exactly as a second request in a second route handler would
  // build one. Nothing is threaded between the calls below, so whatever they share they
  // share through the process — which is the claim these tests are making.
  const pool = (): KeyPool => new KeyPool([KEY_A, KEY_B]);

  it('records the (model, key) pair that answered 429, and only that pair', async () => {
    const gemini = fakeGemini(({ key }) => (key === KEY_A ? RATE_LIMITED : ANSWERS));

    await callWithFallback(analysisRequest(BEST), { keys: pool(), run: gemini.run, now: NOW });

    expect(isExhausted(pairKey(BEST, KEY_A), NOW)).toBe(true);
    // A 429 on one key is a fact about that key: the sibling has its own separate
    // allowance on the same model, and banning it would throw that allowance away.
    expect(isExhausted(pairKey(BEST, KEY_B), NOW)).toBe(false);
    expect(trackedPairs()).toBe(1);
  });

  it('skips a pair an earlier request found dead rather than rediscovering it', async () => {
    const gemini = fakeGemini(({ key }) => (key === KEY_A ? RATE_LIMITED : ANSWERS));

    const first = await callWithFallback(analysisRequest(BEST), {
      keys: pool(),
      run: gemini.run,
      now: NOW,
    });
    expect(first.model).toBe(BEST);
    expect(gemini.attempts).toHaveLength(2);

    const second = await callWithFallback(analysisRequest(BEST), {
      keys: pool(),
      run: gemini.run,
      now: NOW + MINUTE,
    });

    expect(second.model).toBe(BEST);
    expect(second.degraded).toBe(false);
    expect(second.exhaustedPairs).toBe(0);
    // The whole point, stated as a call count: the second request costs ONE round trip
    // rather than two, because the dead pair is never dialled again — and the two
    // requests have nothing in common but the process they ran in.
    expect(gemini.attempts).toHaveLength(3);
    expect(gemini.attempts.filter((attempt) => attempt.key === KEY_A)).toHaveLength(1);
  });

  it('dials the pair again once the ban has lapsed, so a daily reset is noticed', async () => {
    // Refused this morning, refilled since. Nothing announces the reset, so the only way
    // this process can discover it is to stop believing the 429 after a while.
    let refusing = true;
    const gemini = fakeGemini(({ key }) => (key === KEY_A && refusing ? RATE_LIMITED : ANSWERS));

    await callWithFallback(analysisRequest(BEST), { keys: pool(), run: gemini.run, now: NOW });
    refusing = false;

    const later = await callWithFallback(analysisRequest(BEST), {
      keys: pool(),
      run: gemini.run,
      now: NOW + QUOTA_TTL_MS,
    });

    expect(later.model).toBe(BEST);
    expect(gemini.attempts.at(-1)).toEqual({ model: BEST, key: KEY_A });
  });

  it('gives up without a single round trip once the whole ladder is known spent', async () => {
    const gemini = fakeGemini(() => RATE_LIMITED);
    const everyPair = MODEL_LADDER.reasoning.length * 2;

    const discovering = await rejectionOf(
      callWithFallback(analysisRequest(BEST), { keys: pool(), run: gemini.run, now: NOW }),
    );
    expect(genAiErrorOf(discovering).failure).toBe('rate_limited');
    expect(gemini.attempts).toHaveLength(everyPair);

    const remembering = await rejectionOf(
      callWithFallback(analysisRequest(BEST), {
        keys: pool(),
        run: gemini.run,
        now: NOW + MINUTE,
      }),
    );

    expect(genAiErrorOf(remembering).failure).toBe('rate_limited');
    expect(genAiErrorOf(remembering).message).toMatch(/exhausted/i);
    // Not one further request was made: the ladder was walked entirely from memory.
    expect(gemini.attempts).toHaveLength(everyPair);
  });
});

describe('callWithFallback — failures that are not about quota', () => {
  it('stops cycling keys the moment a model turns out to be retired', async () => {
    const gemini = fakeGemini(({ model }) => (model === BEST ? RETIRED : ANSWERS));
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    const result = await callWithFallback(analysisRequest(BEST), {
      keys,
      run: gemini.run,
      now: NOW,
    });

    expect(result.model).toBe(SECOND);
    expect(result.degraded).toBe(true);
    // One attempt on the retired model, not one per key: a 404 is a property of the
    // model, and the other two keys would have been told exactly the same thing.
    expect(modelsTried(gemini)).toEqual([BEST, SECOND]);
    // Remembered against the pair that saw the 404 rather than against the model,
    // because the keys are separate projects and access is granted per project.
    expect(isExhausted(pairKey(BEST, KEY_A), NOW)).toBe(true);
    expect(isExhausted(pairKey(BEST, KEY_B), NOW)).toBe(false);
    // A retirement outlives a daily reset, so it is not counted as quota spent — that
    // figure is what a degraded report has to be explained by.
    expect(result.exhaustedPairs).toBe(0);
  });

  it('still believes a model retired after a quota ban would have lapsed', async () => {
    const gemini = fakeGemini(({ model }) => (model === BEST ? RETIRED : ANSWERS));
    const keys = new KeyPool([KEY_A]);

    await callWithFallback(analysisRequest(BEST), { keys, run: gemini.run, now: NOW });
    const later = await callWithFallback(analysisRequest(BEST), {
      keys,
      run: gemini.run,
      now: NOW + QUOTA_TTL_MS,
    });

    // Nothing about midnight un-retires a model, so the 404 is not re-earned on the
    // schedule a 429 is. The second request never touches the retired model at all.
    expect(later.model).toBe(SECOND);
    expect(modelsTried(gemini)).toEqual([BEST, SECOND, SECOND]);
  });

  const permanent: readonly GenAiFailure[] = [
    'invalid_output',
    'too_large',
    'unauthenticated',
    'unknown',
  ];

  for (const failure of permanent) {
    it(`surfaces ${failure} at once rather than spending quota confirming it`, async () => {
      const gemini = fakeGemini(() => ({ kind: 'fails', failure }));
      const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

      const thrown = await rejectionOf(
        callWithFallback(analysisRequest(BEST), { keys, run: gemini.run, now: NOW }),
      );

      expect(genAiErrorOf(thrown).failure).toBe(failure);
      expect(gemini.attempts).toHaveLength(1);
    });
  }

  it('tries the rest of the ladder on a server-side fault rather than giving up', async () => {
    // A 5xx is usually the service rather than the credential, so it is not evidence
    // another key would fare better — but it costs one request to find out, and the
    // alternative is failing an analysis the next key would have served. The ladder
    // therefore walks every (model, key) pair before surfacing the fault.
    const gemini = fakeGemini(() => ({ kind: 'fails', failure: 'unavailable' }));
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    const thrown = await rejectionOf(
      callWithFallback(analysisRequest(BEST), { keys, run: gemini.run, now: NOW }),
    );

    expect(genAiErrorOf(thrown).failure).toBe('unavailable');
    expect(genAiErrorOf(thrown).retryable).toBe(true);
    // Four reasoning models times three keys. Unlike a daily quota, a 5xx is expected
    // to clear, so the pair is never recorded as exhausted.
    expect(gemini.attempts).toHaveLength(12);
    expect(trackedPairs()).toBe(0);
  });

  it('does not poison a pair for the next request when the service blips', async () => {
    // The outage lasts exactly one request, as most 5xx bursts do.
    let faulting = true;
    const faulty = fakeGemini(() =>
      faulting ? { kind: 'fails', failure: 'unavailable' } : ANSWERS,
    );
    const keys = new KeyPool([KEY_A, KEY_B, KEY_C]);

    await rejectionOf(callWithFallback(analysisRequest(BEST), { keys, run: faulty.run, now: NOW }));
    faulting = false;

    const recovered = await callWithFallback(analysisRequest(BEST), {
      keys: new KeyPool([KEY_A, KEY_B, KEY_C]),
      run: faulty.run,
      now: NOW + MINUTE,
    });

    // Writing a blip into an hour-long memory would outlive the blip and make this
    // process the outage: every key on every model banned for something that had already
    // fixed itself. The best model answers on the very next request instead.
    expect(recovered.model).toBe(BEST);
    expect(recovered.degraded).toBe(false);
    expect(faulty.attempts.at(-1)).toEqual({ model: BEST, key: KEY_A });
  });

  it('lets a failure that is not a GenAiError through untouched', async () => {
    const boom = new RangeError('the fake exploded');
    const gemini = fakeGemini(() => ({ kind: 'breaks', error: boom }));
    const keys = new KeyPool([KEY_A, KEY_B]);

    const thrown = await rejectionOf(
      callWithFallback(analysisRequest(BEST), { keys, run: gemini.run, now: NOW }),
    );

    // Not wrapped, not reclassified: a bug in our own code must arrive looking like one.
    expect(thrown).toBe(boom);
    expect(gemini.attempts).toHaveLength(1);
  });
});
