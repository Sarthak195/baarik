import 'server-only';
import { randomBytes } from 'node:crypto';

import { LIMITS } from '../config/limits';
import { clientKey } from './client-key';

/**
 * The thing standing between one scripted loop and everybody else's demo.
 *
 * `/analyze` is unauthenticated, public, and spends metered third-party quota on every
 * call. The free-tier allowance is twenty requests per model per key per day and one
 * analysis spends two of them, so a stranger with `curl` in a `while` loop can empty
 * the project's entire budget for the day in about a minute. Nothing else in the
 * system can stop that: the key pool and the model ladder make quota go further, they
 * do not stop it being spent.
 *
 * A token bucket rather than a fixed window, because the shape of legitimate use is
 * bursty — an evaluator uploads three documents in a row and then reads for ten
 * minutes — and a fixed window punishes exactly that while letting a steady drip
 * through. `capacity` is the burst it allows; `refillPerMinute` is the sustained rate,
 * set well below what a script wants and well above what a person does.
 *
 * In memory, like the report store and for the same reason: a shared counter would
 * mean a database, and ADR 0008 says there is no database. Two Cloud Run instances
 * therefore meter independently, which weakens the bound by the number of instances
 * and is stated rather than hidden. At this project's scale that is one instance.
 */
export interface RateLimitDecision {
  readonly allowed: boolean;
  /**
   * Whole seconds until the next token, for the `Retry-After` header. Zero when
   * allowed. Never zero when refused — a `Retry-After: 0` invites an immediate retry.
   */
  readonly retryAfterSeconds: number;
  /** Tokens left after this request. Reported per request, never accumulated anywhere. */
  readonly remaining: number;
}

interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

interface LimiterState {
  readonly buckets: Map<string, Bucket>;
  /** Generated once per process and never written anywhere. See `client-key.ts`. */
  readonly salt: string;
}

const { capacity: CAPACITY, refillPerMinute: REFILL_PER_MINUTE } = LIMITS.rateLimit;

const MINUTE_MS = 60_000;

/**
 * After this long untouched, any bucket has refilled to capacity — and a full bucket
 * is indistinguishable from a client that has never been seen. Forgetting it changes
 * no decision, which is what makes eviction here free rather than a trade-off.
 */
const FULL_REFILL_MS = Math.ceil((CAPACITY / REFILL_PER_MINUTE) * MINUTE_MS);

/**
 * A hard ceiling on the map, bounded for the same reason as the report store: an
 * endpoint a stranger can reach must not be able to grow the heap by being called.
 * Ten thousand hashed keys is under a megabyte, and far more concurrent clients than
 * this deployment will ever see.
 */
const MAX_CLIENTS = 10_000;

/**
 * Hung off `globalThis` rather than held in a module constant, for the reason
 * documented at length in `src/server/store/report-store.ts`: Next bundles route
 * handlers into separate server chunks, so a module-level `Map` is instantiated more
 * than once per process. That bug already cost this project every live report once.
 * A limiter with the same bug would be worse — it would fail silently, because a
 * limiter that never fires looks exactly like a limiter that is not needed.
 */
const STATE_KEY = Symbol.for('baarik.rateLimiter');

type GlobalWithLimiter = typeof globalThis & {
  [STATE_KEY]?: LimiterState;
};

function state(): LimiterState {
  const container = globalThis as GlobalWithLimiter;
  const existing = container[STATE_KEY];
  if (existing !== undefined) return existing;

  const created: LimiterState = { buckets: new Map(), salt: randomBytes(16).toString('hex') };
  container[STATE_KEY] = created;
  return created;
}

/**
 * Spend one token for this client, or refuse.
 *
 * The clock arrives as a parameter. `src/server` is not bound by the purity rules that
 * govern `src/core`, but a limiter tested through fake timers is a limiter whose tests
 * are about the timers; passing `now` makes refill and eviction assertable as plain
 * arithmetic, and costs the caller one `Date.now()`.
 */
export function checkRateLimit(headers: Headers, now: number): RateLimitDecision {
  const { buckets, salt } = state();
  const key = clientKey(headers, salt);

  const existing = buckets.get(key);
  const available = existing === undefined ? CAPACITY : refilled(existing, now);

  if (available < 1) {
    // The refilled figure is still recorded: the wait is measured from now, so a
    // client that keeps retrying does not restart its own clock by doing so.
    remember(buckets, key, { tokens: available, updatedAt: now });
    return { allowed: false, retryAfterSeconds: secondsUntilNextToken(available), remaining: 0 };
  }

  const left = available - 1;
  remember(buckets, key, { tokens: left, updatedAt: now });
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(left) };
}

/** How many clients are currently remembered. Used by tests; never called in production. */
export function trackedClients(): number {
  return state().buckets.size;
}

/** Forget every client. Used by tests; never called in production. */
export function clearRateLimits(): void {
  state().buckets.clear();
}

function refilled(bucket: Bucket, now: number): number {
  // A clock that steps backwards must not hand out tokens. Cloud Run's wall clock is
  // adjusted by NTP like any other, and the correction is free quota otherwise.
  const elapsed = Math.max(0, now - bucket.updatedAt);
  return Math.min(CAPACITY, bucket.tokens + (elapsed / MINUTE_MS) * REFILL_PER_MINUTE);
}

function secondsUntilNextToken(available: number): number {
  const wait = ((1 - available) / REFILL_PER_MINUTE) * 60;
  return Math.max(1, Math.ceil(wait));
}

/**
 * Record the bucket and keep the map bounded.
 *
 * The entry is deleted before it is set so that `Map` insertion order is least-recently
 * seen first. That ordering is what makes eviction cheap: the age pass stops at the
 * first bucket worth keeping, and the ceiling drops from the front, so neither walks
 * ten thousand buckets on every request.
 */
function remember(buckets: Map<string, Bucket>, key: string, bucket: Bucket): void {
  buckets.delete(key);
  buckets.set(key, bucket);

  for (const [id, stored] of buckets) {
    if (stored.updatedAt + FULL_REFILL_MS > bucket.updatedAt) break;
    buckets.delete(id);
  }

  // The ceiling is the backstop for a flood from many addresses at once, where nothing
  // is old enough to have refilled. Evicting the least recently seen client is a
  // deliberate choice to fail open for it rather than to grow without bound.
  while (buckets.size > MAX_CLIENTS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}
