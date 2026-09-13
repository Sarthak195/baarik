import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See key-pool.test.ts: the marker throws outside a React Server Component and vitest is
// not one. Hoisted above the dynamic imports below.
vi.mock('server-only', () => ({}));

/**
 * `env.ts` parses the shape of the environment at module load and resolves credentials
 * on first use, so every case here arranges `process.env` and then imports the module
 * fresh. `vi.resetModules()` is what makes the second import re-run the parse and drop
 * the memoised keys rather than hand back the first one's result — and it means these
 * tests exercise the real failures rather than stand-ins for them.
 */

/** Only the variables this module reads are disturbed; wiping `process.env` wholesale
 * would take PATH and the runner's own configuration with it. */
const MANAGED = /^(?:GEMINI_API_KEY|LOG_LEVEL|NODE_ENV)/;

const ORIGINAL_ENV = { ...process.env };

const A_KEY = 'AQ.Ab8RN6exampleexampleexampleexampleexample1';
const B_KEY = 'AQ.Ab8RN6exampleexampleexampleexampleexample2';
const C_KEY = 'AQ.Ab8RN6exampleexampleexampleexampleexample3';

function clearManaged(): void {
  for (const key of Object.keys(process.env)) {
    if (MANAGED.test(key)) Reflect.deleteProperty(process.env, key);
  }
}

function setEnv(values: Record<string, string>): void {
  clearManaged();
  Object.assign(process.env, { NODE_ENV: 'test', ...values });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  clearManaged();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (MANAGED.test(key) && value !== undefined) process.env[key] = value;
  }
});

describe('getGeminiKeys', () => {
  it('splits a comma-separated list, trimming and dropping empties', async () => {
    setEnv({ GEMINI_API_KEY: ` ${A_KEY} , ${B_KEY} ,, ` });

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual([A_KEY, B_KEY]);
  });

  it('accepts whitespace as a separator, because that is what a paste produces', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY}\n${B_KEY}` });

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual([A_KEY, B_KEY]);
  });

  it('collects numbered variants it was never told about', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, GEMINI_API_KEY6: B_KEY, GEMINI_API_KEY7: C_KEY });

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual([A_KEY, B_KEY, C_KEY]);
  });

  it('de-duplicates across both shapes while preserving declaration order', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY},${B_KEY}`, GEMINI_API_KEY2: A_KEY, GEMINI_API_KEY3: C_KEY });

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual([A_KEY, B_KEY, C_KEY]);
  });

  it('works when only numbered variants are set and the bare variable is absent', async () => {
    setEnv({ GEMINI_API_KEY6: B_KEY });

    const { getGeminiKeys, getGeminiKeyPool } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual([B_KEY]);
    expect(getGeminiKeyPool().next()).toBe(B_KEY);
  });

  it('accepts a key of any shape, because only the network can say a key is bad', async () => {
    setEnv({ GEMINI_API_KEY: 'not-shaped-like-any-google-key' });

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(getGeminiKeys()).toEqual(['not-shaped-like-any-google-key']);
  });
});

describe('module-load validation', () => {
  it('imports cleanly with no key at all, because a build machine has none', async () => {
    setEnv({});

    // The regression this pins: `next build` evaluates every route module to collect
    // page data, so a module that threw here turned a missing credential into a build
    // failure — and CI, which is offline by design and holds no secret, went red.
    await expect(import('@/server/config/env')).resolves.toBeDefined();
  });

  it('refuses on first use with no key at all, naming both accepted shapes', async () => {
    setEnv({});

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(() => getGeminiKeys()).toThrow(/GEMINI_API_KEY[\s\S]*GEMINI_API_KEY2/);
  });

  it('treats a blank key as no key', async () => {
    setEnv({ GEMINI_API_KEY: '   ' });

    const { getGeminiKeyPool } = await import('@/server/config/env');
    expect(() => getGeminiKeyPool()).toThrow(/No Gemini API key/);
  });

  it('does not remember the absence, so a late-mounted secret is picked up', async () => {
    setEnv({});

    const { getGeminiKeys } = await import('@/server/config/env');
    expect(() => getGeminiKeys()).toThrow(/No Gemini API key/);

    process.env.GEMINI_API_KEY = A_KEY;
    expect(getGeminiKeys()).toEqual([A_KEY]);
  });

  it('rejects an unknown LOG_LEVEL by name', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, LOG_LEVEL: 'verbose' });

    await expect(import('@/server/config/env')).rejects.toThrow(/LOG_LEVEL/);
  });

  it('never puts a key value into the failure message', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, NODE_ENV: 'staging' });

    const thrown: unknown = await import('@/server/config/env').catch((cause: unknown) => cause);
    expect(thrown).toBeInstanceOf(Error);

    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).toContain('NODE_ENV');
    expect(message).not.toContain(A_KEY);
  });
});

describe('getGeminiKeyPool', () => {
  it('is a single shared pool over the collected keys', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY},${B_KEY}` });

    const { getGeminiKeyPool } = await import('@/server/config/env');
    const pool = getGeminiKeyPool();
    expect(pool.size).toBe(2);
    expect([pool.next(), pool.next(), pool.next()]).toEqual([A_KEY, B_KEY, A_KEY]);
  });

  it('hands every caller the same pool, so round-robin is actually round-robin', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY},${B_KEY}` });

    const { getGeminiKeyPool } = await import('@/server/config/env');
    // Two consumers each holding their own pool would both start at the first key and
    // exhaust it together, which is the failure this memoisation exists to prevent.
    expect(getGeminiKeyPool().next()).toBe(A_KEY);
    expect(getGeminiKeyPool().next()).toBe(B_KEY);
  });
});
