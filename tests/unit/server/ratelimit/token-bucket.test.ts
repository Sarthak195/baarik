import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LIMITS } from '@/server/config/limits';
import { checkRateLimit, clearRateLimits, trackedClients } from '@/server/ratelimit/token-bucket';

vi.mock('server-only', () => ({}));

/**
 * `/analyze` is unauthenticated, public, and spends metered third-party quota on every
 * call. These tests are about one property: a scripted loop must run out of tokens
 * quickly, and a person uploading three documents in a row must not.
 *
 * The clock is a parameter, so none of this needs fake timers. Time here is arithmetic
 * on a number, which makes refill and eviction assertable rather than approximated.
 */

const { capacity: CAPACITY, refillPerMinute: REFILL } = LIMITS.rateLimit;

const MINUTE = 60_000;
const T0 = 1_757_800_000_000;

const from = (ip: string): Headers => new Headers({ 'x-forwarded-for': ip });

const ME = from('203.0.113.42');
const SOMEONE_ELSE = from('198.51.100.7');

/** Spend `count` requests for one client and hand back the last decision. */
function spend(headers: Headers, count: number, now: number) {
  let last = checkRateLimit(headers, now);
  for (let i = 1; i < count; i += 1) last = checkRateLimit(headers, now);
  return last;
}

beforeEach(() => {
  clearRateLimits();
});

describe('checkRateLimit', () => {
  it('lets a burst of the full capacity through', () => {
    // The shape of legitimate use: an evaluator uploads several documents in a row.
    // A fixed window would punish exactly that, which is why this is a bucket.
    for (let i = 0; i < CAPACITY; i += 1) {
      expect(checkRateLimit(ME, T0).allowed).toBe(true);
    }
  });

  it('refuses the request after the burst', () => {
    spend(ME, CAPACITY, T0);

    expect(checkRateLimit(ME, T0).allowed).toBe(false);
  });

  it('counts down the tokens it has left', () => {
    const first = checkRateLimit(ME, T0);
    const second = checkRateLimit(ME, T0);

    expect(first.remaining).toBe(CAPACITY - 1);
    expect(second.remaining).toBe(CAPACITY - 2);
  });

  it('never answers a refusal with Retry-After: 0', () => {
    spend(ME, CAPACITY, T0);

    // A zero would invite an immediate retry, which is the one thing a refused client
    // must not do.
    const refused = checkRateLimit(ME, T0);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(refused.retryAfterSeconds)).toBe(true);
  });

  it('asks for a wait no longer than it takes one token to refill', () => {
    spend(ME, CAPACITY, T0);

    const refused = checkRateLimit(ME, T0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(60 / REFILL));
  });

  it('honours its own Retry-After: waiting exactly that long is enough', () => {
    spend(ME, CAPACITY, T0);
    const refused = checkRateLimit(ME, T0);

    const afterWaiting = checkRateLimit(ME, T0 + refused.retryAfterSeconds * 1000);
    expect(afterWaiting.allowed).toBe(true);
  });

  it('refills at the configured rate rather than all at once', () => {
    spend(ME, CAPACITY, T0);

    const aMinuteLater = T0 + MINUTE;
    for (let i = 0; i < REFILL; i += 1) {
      expect(checkRateLimit(ME, aMinuteLater).allowed).toBe(true);
    }
    expect(checkRateLimit(ME, aMinuteLater).allowed).toBe(false);
  });

  it('never refills past capacity, however long the client was away', () => {
    spend(ME, CAPACITY, T0);

    const aWeekLater = T0 + 7 * 24 * 60 * MINUTE;
    for (let i = 0; i < CAPACITY; i += 1) {
      expect(checkRateLimit(ME, aWeekLater).allowed).toBe(true);
    }
    // One week of refill is not one week of tokens: the bucket is a burst allowance,
    // not a savings account.
    expect(checkRateLimit(ME, aWeekLater).allowed).toBe(false);
  });

  it('does not restart the wait when a refused client keeps retrying', () => {
    spend(ME, CAPACITY, T0);

    const halfway = Math.floor(MINUTE / REFILL / 2);
    for (let i = 0; i < 20; i += 1) checkRateLimit(ME, T0 + halfway);

    // Hammering during the wait must not reset it, or an impatient client would lock
    // itself out for as long as it kept trying.
    expect(checkRateLimit(ME, T0 + Math.ceil(MINUTE / REFILL) + 1).allowed).toBe(true);
  });

  it('grants nothing when the clock steps backwards', () => {
    spend(ME, CAPACITY, T0);

    // NTP corrects Cloud Run's wall clock like any other. A correction must not be
    // free quota.
    expect(checkRateLimit(ME, T0 - 10 * MINUTE).allowed).toBe(false);
  });

  it('meters each client separately', () => {
    spend(ME, CAPACITY, T0);

    expect(checkRateLimit(ME, T0).allowed).toBe(false);
    expect(checkRateLimit(SOMEONE_ELSE, T0).allowed).toBe(true);
  });
});

describe('the bucket map', () => {
  it('forgets a client once its bucket has had time to refill completely', () => {
    spend(ME, CAPACITY, T0);
    expect(trackedClients()).toBe(1);

    const fullRefillMs = (CAPACITY / REFILL) * MINUTE;
    checkRateLimit(SOMEONE_ELSE, T0 + fullRefillMs + 1);

    // A full bucket is indistinguishable from a client never seen before, so dropping
    // it changes no decision — which is what makes eviction free rather than a
    // trade-off against accuracy.
    expect(trackedClients()).toBe(1);
    expect(checkRateLimit(ME, T0 + fullRefillMs + 1).allowed).toBe(true);
  });

  it('keeps a client that is still inside its window', () => {
    spend(ME, CAPACITY, T0);
    checkRateLimit(SOMEONE_ELSE, T0 + MINUTE);

    expect(trackedClients()).toBe(2);
  });

  it('stays bounded under a flood from many addresses at once', () => {
    // The heap is the thing being protected here: an endpoint a stranger can reach
    // must not grow memory by being called.
    for (let i = 0; i < 12_000; i += 1) {
      checkRateLimit(
        from(`10.${String(i >> 16)}.${String((i >> 8) % 256)}.${String(i % 256)}`),
        T0,
      );
    }

    expect(trackedClients()).toBeLessThanOrEqual(10_000);
  });
});
