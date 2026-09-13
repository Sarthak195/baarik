import 'server-only';
import { z } from 'zod';

import { KeyPool } from './key-pool';

/**
 * Environment validation.
 *
 * Reading `process.env` at the point of use spreads the failure out: a malformed
 * setting surfaces as a 500 on whichever request happens to touch that code path
 * first, with a stack trace pointing at the consumer rather than at the deployment.
 * Parsing the shape here instead means it is checked once, where the message is read
 * by the person who can fix it.
 *
 * Credentials are the deliberate exception and are resolved lazily — see
 * `getGeminiKeys` for why a build machine must never be asked for one.
 *
 * Nothing in this file logs a key, in whole or in part. Truncated secrets still leak —
 * a prefix identifies which key was used and a suffix narrows a brute force — and a
 * log line is the one artefact that reliably outlives the incident that produced it.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /**
   * Optional in the schema and mandatory in practice: the keys may arrive entirely
   * through the numbered variants below, so the "at least one key" rule is enforced
   * against the collected pool rather than against this one variable.
   */
  GEMINI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Unknown variables are ignored rather than rejected, which is what lets a deployment
 * add `GEMINI_API_KEY8` without editing this schema.
 */
function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  // Only variable names travel into the message. An invalid-value report that quoted
  // the value would print a malformed API key into the deployment log.
  const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'env')))];
  throw new Error(
    `Invalid environment: ${names.join(', ')}. See .env.example for the expected shape. ` +
      'Values are omitted from this message on purpose.',
  );
}

export const env: Env = parseEnv(process.env);

const GEMINI_KEY_PREFIX = 'GEMINI_API_KEY';
/** Keys may be listed with commas or whitespace; both survive a copy-paste. */
const KEY_SEPARATOR = /[\s,]+/;

/**
 * Gather every configured Gemini key, in the order the environment declares them.
 *
 * Two shapes are accepted because both are already in use: `GEMINI_API_KEY` may hold a
 * separated list, and any number of suffixed variables (`GEMINI_API_KEY6`,
 * `GEMINI_API_KEY7`, …) may each hold one. The suffixed form is discovered by scanning
 * for the prefix rather than declared one variable at a time, because a hard-coded list
 * fails in the worst possible way — it ignores a key that was added correctly and the
 * pool silently runs smaller than the operator believes it does.
 *
 * No format check is applied. Google's key format has already changed once, working
 * keys currently do not resemble the documented shape, and only the network can say
 * whether a key is live; a dead key is the pool's problem, not the parser's.
 */
function collectGeminiKeys(source: Record<string, string | undefined>): readonly string[] {
  const collected = new Set<string>();

  for (const [name, value] of Object.entries(source)) {
    if (!name.startsWith(GEMINI_KEY_PREFIX) || value === undefined) continue;
    for (const key of value.split(KEY_SEPARATOR)) {
      if (key.length > 0) collected.add(key);
    }
  }

  // A Set preserves insertion order, so declaration order survives de-duplication.
  return [...collected];
}

let collectedKeys: readonly string[] | null = null;

/**
 * The configured keys, resolved on first use rather than at import.
 *
 * `next build` evaluates every route module to collect page data, so whatever a route
 * imports runs on a build machine — and a build machine holds no credentials. Throwing
 * at import time therefore turned a missing key into a *build* failure: CI is offline
 * by design, carries no secret, and went red on a repository whose entire test suite
 * runs without a key.
 *
 * The rule itself is unchanged — a request may not proceed without a key — it has only
 * moved to the first moment the key is genuinely needed, which is the moment before a
 * model is called. A build needs no credential; a request still cannot do without one.
 */
export function getGeminiKeys(): readonly string[] {
  if (collectedKeys !== null) return collectedKeys;

  const keys = collectGeminiKeys(process.env);
  // The failure is deliberately not memoised. A secret can be mounted after the
  // process starts, and remembering "there are none" would outlive the condition.
  if (keys.length === 0) {
    throw new Error(
      'No Gemini API key is configured. Set GEMINI_API_KEY to one key or to a ' +
        'comma-separated list, and/or set numbered variants such as GEMINI_API_KEY2. ' +
        'See .env.example.',
    );
  }

  collectedKeys = keys;
  return keys;
}

let sharedPool: KeyPool | null = null;

/**
 * The process-wide pool. One instance, because round-robin across separate pools is not
 * round-robin at all — two consumers each holding their own pool would both start at
 * the first key and exhaust it together.
 */
export function getGeminiKeyPool(): KeyPool {
  sharedPool ??= new KeyPool(getGeminiKeys());
  return sharedPool;
}

export { KeyPool };
