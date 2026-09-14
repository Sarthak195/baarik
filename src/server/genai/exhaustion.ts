import 'server-only';

import type { ModelId } from './models';

/**
 * What this process has already learned about which (model, key) pairs are spent.
 *
 * Free-tier quota is counted per model per key, and Google publishes neither the
 * ceiling nor the reset, so the ladder in `gateway.ts` discovers exhaustion the only
 * way it can: by dialling a pair and being refused. That discovery costs a round trip,
 * and until this module existed it was thrown away the instant the request that paid
 * for it ended. The next upload dialled the same dead pair, waited for the same 429,
 * and only then started walking down the ladder. On a judging day, when the quota is
 * gone by mid-morning, that is not the edge case — it is every upload after the first.
 *
 * The map is hung off `globalThis` rather than held in a module constant, for the
 * reason documented at length in `src/server/store/report-store.ts`: Next bundles route
 * handlers into separate server chunks, so a module-level `Map` is instantiated more
 * than once in one process. That bug already cost this project every live report once.
 * Here it would be worse, because it would be invisible: `/analyze` and `/api/ask` both
 * call the gateway, and each would patiently teach its own copy the same 429s while
 * looking exactly like a memory that was working.
 *
 * Nothing in here is document data, and nothing in here is a credential — a pair is a
 * model id and the last eight characters of a key. The map is bounded by the ladder
 * itself, a few dozen combinations of the models in `models.ts` and the keys in the
 * pool, so it needs no eviction ceiling; expiry alone keeps it small. It is still only
 * memory, and still lost on restart.
 */
export type ExhaustionKind =
  /** A 429: this pair's daily allowance is spent. Its siblings' allowances are not. */
  | 'rate_limited'
  /** A 404: the model is not callable by this key at all. Not a quota fact. */
  | 'model_unavailable';

/**
 * How long a 429 against a pair is believed.
 *
 * The allowance is daily, so no TTL can be aligned to the reset — the boundary is
 * unpublished, and the keys need not even share it. The only real question is how often
 * this process is willing to spend one 429 finding out whether the reset has happened
 * yet. An hour is that price: between probes every request skips the dead pair for
 * nothing, and a pair that refilled just after a probe sits idle for at most the rest of
 * the hour.
 *
 * Erring long rather than short is deliberate. Holding a ban an hour past the reset
 * costs one rung of model quality on a ladder built to absorb exactly that, and the
 * substitute is already answering; expiring early puts the wasted round trip back onto
 * the critical path of somebody's upload, which is the thing this module exists to take
 * off it. A day-long TTL would err too far the same way to be useful — a pair exhausted
 * at eleven at night would stay banned through the whole of the day it was waiting for.
 */
export const QUOTA_TTL_MS = 60 * 60 * 1000;

/**
 * How long a 404 against a pair is believed.
 *
 * Deliberately longer than the quota TTL, because it is a different kind of fact. A
 * retired model does not come back at midnight: `models.ts` records the entire 2.5
 * family answering `models.list` for a current key and then refusing every real call,
 * and a ban that lapsed on the daily boundary would have this process rediscover that
 * permanent 404 as often as it rediscovers a temporary 429.
 *
 * Six hours rather than for ever, because the evidence is a single status code read by
 * `classifyGenAiError`, which has no stable SDK taxonomy to read instead. If that
 * classification is ever wrong, the cost is one rung of quality for an afternoon rather
 * than for the life of the container. The waste being traded against is small anyway: a
 * 404 breaks out of the key loop after one attempt, where a 429 walks the whole rotation.
 */
export const RETIREMENT_TTL_MS = 6 * 60 * 60 * 1000;

const STATE_KEY = Symbol.for('baarik.exhaustedPairs');

type GlobalWithMemory = typeof globalThis & {
  /** Pair to the instant its ban lapses. The kind that caused it only chooses the TTL. */
  [STATE_KEY]?: Map<string, number>;
};

function memory(): Map<string, number> {
  const container = globalThis as GlobalWithMemory;
  const existing = container[STATE_KEY];
  if (existing !== undefined) return existing;

  const created = new Map<string, number>();
  container[STATE_KEY] = created;
  return created;
}

/**
 * How a pair is named.
 *
 * The last eight characters of the key, never the key itself. This string is a map key
 * today and exactly the sort of value that ends up inside a log line tomorrow, and a
 * credential that was never written down cannot be leaked by whoever adds that line.
 * Eight characters of a random key tell six of them apart with room to spare.
 */
export const pairKey = (model: ModelId, key: string): string => `${model}::${key.slice(-8)}`;

/**
 * Whether this pair is known spent, and therefore worth skipping without a round trip.
 *
 * The clock arrives as a parameter, as it does in `checkRateLimit` and `getReport`. A
 * ban that has lapsed is deleted on the way past rather than left to accumulate, which
 * also means "has this expired?" is plain arithmetic a test can state instead of
 * something a suite has to install fake timers to reach.
 */
export function isExhausted(pair: string, now: number): boolean {
  const pairs = memory();
  const expiresAt = pairs.get(pair);
  if (expiresAt === undefined) return false;

  if (now >= expiresAt) {
    pairs.delete(pair);
    return false;
  }
  return true;
}

/**
 * Record what a failed attempt proved about a pair.
 *
 * Only the two failures that are properties of the pair itself are admissible here, and
 * the caller is what enforces that. A `unavailable` — a 5xx — deliberately never
 * reaches this function: it is a statement about the service at that moment, not about
 * this key's allowance, and writing it down would turn a blip lasting seconds into a
 * self-inflicted outage lasting an hour, on a pair that was fine the whole time. The
 * key pool's own demotion already handles a transient fault, at the timescale a
 * transient fault deserves.
 */
export function rememberExhausted(pair: string, kind: ExhaustionKind, now: number): void {
  const pairs = memory();
  const expiresAt = now + (kind === 'rate_limited' ? QUOTA_TTL_MS : RETIREMENT_TTL_MS);

  // Never shortened by a later, weaker observation. A 429 on a pair already known
  // retired says only that an account is also out of quota on a model it cannot call;
  // letting the shorter ban win would put that 404 back on the ladder an hour later.
  pairs.set(pair, Math.max(pairs.get(pair) ?? 0, expiresAt));

  // Swept on write rather than on a timer, because a timer would be a second thing to
  // get wrong and this map is a few dozen entries at its largest. A ban nobody asks
  // about again is dropped the next time any pair is recorded.
  for (const [known, lapsesAt] of pairs) {
    if (now >= lapsesAt) pairs.delete(known);
  }
}

/** How many pairs are currently remembered. Used by tests; never called in production. */
export function trackedPairs(): number {
  return memory().size;
}

/** Forget every pair. Used by tests; never called in production. */
export function clearExhausted(): void {
  memory().clear();
}
