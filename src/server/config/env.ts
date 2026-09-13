import 'server-only';
import { z } from 'zod';

import { KeyPool } from './key-pool';

/**
 * Environment validation, performed once at module load.
 *
 * Reading `process.env` at the point of use spreads the failure out: a missing key
 * surfaces as a 500 on whichever request happens to touch that code path first, with a
 * stack trace pointing at the consumer rather than at the deployment. Parsing here
 * instead means a malformed environment stops the process at boot, where the message
 * is read by the person who can fix it.
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
  /**
   * Off unless explicitly enabled. The law-check pass costs an extra model call per
   * document, so a deployment opts into it rather than discovering it on the bill.
   */
  ENABLE_LAW_CHECK: z.enum(['true', 'false']).default('false'),
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

export const geminiKeys: readonly string[] = collectGeminiKeys(process.env);

if (geminiKeys.length === 0) {
  throw new Error(
    'No Gemini API key is configured. Set GEMINI_API_KEY to one key or to a ' +
      'comma-separated list, and/or set numbered variants such as GEMINI_API_KEY2. ' +
      'See .env.example.',
  );
}

/**
 * The process-wide pool. One instance, because round-robin across separate pools is not
 * round-robin at all — two consumers each holding their own pool would both start at
 * the first key and exhaust it together.
 */
export const geminiKeyPool = new KeyPool(geminiKeys);

/** Optional behaviour, resolved once so a feature cannot be half-on across two modules. */
export const features: { readonly lawCheck: boolean } = {
  lawCheck: env.ENABLE_LAW_CHECK === 'true',
};

export { KeyPool };
