import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExhausted,
  isExhausted,
  pairKey,
  QUOTA_TTL_MS,
  rememberExhausted,
  RETIREMENT_TTL_MS,
  trackedPairs,
} from '@/server/genai/exhaustion';
import { MODELS } from '@/server/genai/models';

// See key-pool.test.ts: `server-only` throws outside a React Server Component and vitest
// is not one.
vi.mock('server-only', () => ({}));

/**
 * The memory that makes the ladder worth walking once.
 *
 * Everything here is about two properties. A pair discovered spent must stay spent for
 * long enough to save the next request a 429, and it must NOT stay spent so long that a
 * daily reset goes unnoticed — a pair banned for ever is capacity thrown away for free.
 *
 * The clock is a parameter, so none of this needs fake timers: expiry is arithmetic on a
 * number, which makes the TTL boundary assertable rather than approximated.
 */

const T0 = 1_757_800_000_000;
const MINUTE = 60_000;

const BEST = MODELS.reasoning;

// Distinct in their last eight characters, because that is the slice a pair is named by.
const KEY_A = 'key-alpha-1';
const KEY_B = 'key-bravo-2';

const A = pairKey(BEST, KEY_A);
const B = pairKey(BEST, KEY_B);

const STATE_KEY = Symbol.for('baarik.exhaustedPairs');

type GlobalWithMemory = typeof globalThis & { [STATE_KEY]?: Map<string, number> };

/** What a second copy of this module would see: the map, reached through the symbol. */
function sharedMap(): Map<string, number> | undefined {
  return (globalThis as GlobalWithMemory)[STATE_KEY];
}

beforeEach(() => {
  clearExhausted();
});

describe('pairKey', () => {
  it('names the model and only the tail of the key', () => {
    // The whole key must never enter this string. It is a map key today and exactly the
    // kind of value that ends up inside a log line tomorrow.
    expect(A).toContain(BEST);
    expect(A).toContain(KEY_A.slice(-8));
    expect(A).not.toContain(KEY_A);
  });

  it('tells two keys on the same model apart', () => {
    // Quota is counted per model per key, so collapsing two keys into one name would
    // ban a key that still had its own full allowance.
    expect(A).not.toBe(B);
  });
});

describe('a pair that answered 429', () => {
  it('is unknown until something says otherwise', () => {
    expect(isExhausted(A, T0)).toBe(false);
  });

  it('is skipped from the moment it is recorded', () => {
    rememberExhausted(A, 'rate_limited', T0);

    expect(isExhausted(A, T0)).toBe(true);
  });

  it('says nothing about the same model on another key', () => {
    rememberExhausted(A, 'rate_limited', T0);

    // The allowance is per model per key. Treating one key's 429 as evidence about the
    // next would throw away the capacity the pool exists to provide.
    expect(isExhausted(B, T0)).toBe(false);
  });

  it('holds the ban for the whole of the quota TTL', () => {
    rememberExhausted(A, 'rate_limited', T0);

    expect(isExhausted(A, T0 + QUOTA_TTL_MS - 1)).toBe(true);
  });

  it('lets the ban go once the TTL has passed, so a daily reset is noticed', () => {
    rememberExhausted(A, 'rate_limited', T0);

    // Free-tier quota resets daily. A pair banned until the process restarts would be
    // capacity given away — the opposite of what this memory is for.
    expect(isExhausted(A, T0 + QUOTA_TTL_MS)).toBe(false);
  });

  it('forgets the entry rather than keeping a lapsed one', () => {
    rememberExhausted(A, 'rate_limited', T0);
    isExhausted(A, T0 + QUOTA_TTL_MS);

    expect(trackedPairs()).toBe(0);
  });

  it('starts the ban again when the pair answers 429 a second time', () => {
    rememberExhausted(A, 'rate_limited', T0);
    rememberExhausted(A, 'rate_limited', T0 + 30 * MINUTE);

    // The later refusal is fresher evidence, so the hour runs from it. Otherwise a pair
    // that is still being refused would be re-probed on a schedule set by the first 429
    // it ever answered.
    expect(isExhausted(A, T0 + QUOTA_TTL_MS)).toBe(true);
    expect(isExhausted(A, T0 + 30 * MINUTE + QUOTA_TTL_MS)).toBe(false);
  });
});

describe('a model that turned out to be retired', () => {
  it('stays banned across a quota reset, because a 404 is not a spent allowance', () => {
    rememberExhausted(A, 'model_unavailable', T0);

    // `models.ts` records the 2.5 family answering `models.list` and refusing every real
    // call. Nothing about midnight changes that, so the two failures cannot share a TTL.
    expect(isExhausted(A, T0 + QUOTA_TTL_MS)).toBe(true);
    expect(RETIREMENT_TTL_MS).toBeGreaterThan(QUOTA_TTL_MS);
  });

  it('is still not believed for ever', () => {
    rememberExhausted(A, 'model_unavailable', T0);

    // The evidence is one status code from an SDK with no stable error taxonomy. If it
    // was read wrongly, the cost is an afternoon of one rung of quality, not a container
    // that has to be redeployed to try the model again.
    expect(isExhausted(A, T0 + RETIREMENT_TTL_MS)).toBe(false);
  });

  it('is not shortened by a later 429 on the same pair', () => {
    rememberExhausted(A, 'model_unavailable', T0);
    rememberExhausted(A, 'rate_limited', T0 + MINUTE);

    // A 429 on a model this key cannot call says only that the account is also out of
    // quota. Letting the shorter ban win would put the 404 back on the ladder in an hour.
    expect(isExhausted(A, T0 + QUOTA_TTL_MS + MINUTE)).toBe(true);
  });
});

describe('the memory itself', () => {
  it('sweeps lapsed bans when any pair is recorded', () => {
    rememberExhausted(A, 'rate_limited', T0);
    rememberExhausted(B, 'rate_limited', T0 + QUOTA_TTL_MS);

    // Nothing evicts on a timer, so a pair nobody asks about again would otherwise sit
    // in the map until the process ended.
    expect(trackedPairs()).toBe(1);
  });

  it('keeps its map on globalThis, where a second copy of this module finds it', () => {
    rememberExhausted(A, 'rate_limited', T0);

    // Next bundles route handlers into separate server chunks, so `/analyze` and
    // `/api/ask` can each load their own instance of this module. A module-level `const`
    // would give each of them a private map: the bug that cost this project every live
    // report once, and one that here would be silent, because a memory that never hits
    // looks exactly like a memory that is not needed. Reaching the map through the
    // well-known symbol is what the second instance does, so it is what this asserts.
    expect([...(sharedMap()?.keys() ?? [])]).toEqual([A]);
  });

  it('is emptied by the test-only reset', () => {
    rememberExhausted(A, 'rate_limited', T0);
    clearExhausted();

    expect(trackedPairs()).toBe(0);
    expect(isExhausted(A, T0)).toBe(false);
  });
});
