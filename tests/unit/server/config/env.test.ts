import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See key-pool.test.ts: the marker throws outside a React Server Component and vitest is
// not one. Hoisted above the dynamic imports below.
vi.mock('server-only', () => ({}));

/**
 * `env.ts` validates at module load on purpose, so every case here arranges `process.env`
 * and then imports the module fresh. `vi.resetModules()` is what makes the second import
 * re-run the parse rather than hand back the first one's cached result — and it means
 * these tests exercise the boot-time failure itself rather than a stand-in for it.
 */

/** Only the variables this module reads are disturbed; wiping `process.env` wholesale
 * would take PATH and the runner's own configuration with it. */
const MANAGED = /^(?:GEMINI_API_KEY|ENABLE_LAW_CHECK|LOG_LEVEL|NODE_ENV)/;

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

describe('geminiKeys', () => {
  it('splits a comma-separated list, trimming and dropping empties', async () => {
    setEnv({ GEMINI_API_KEY: ` ${A_KEY} , ${B_KEY} ,, ` });

    const { geminiKeys } = await import('@/server/config/env');
    expect(geminiKeys).toEqual([A_KEY, B_KEY]);
  });

  it('accepts whitespace as a separator, because that is what a paste produces', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY}\n${B_KEY}` });

    const { geminiKeys } = await import('@/server/config/env');
    expect(geminiKeys).toEqual([A_KEY, B_KEY]);
  });

  it('collects numbered variants it was never told about', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, GEMINI_API_KEY6: B_KEY, GEMINI_API_KEY7: C_KEY });

    const { geminiKeys } = await import('@/server/config/env');
    expect(geminiKeys).toEqual([A_KEY, B_KEY, C_KEY]);
  });

  it('de-duplicates across both shapes while preserving declaration order', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY},${B_KEY}`, GEMINI_API_KEY2: A_KEY, GEMINI_API_KEY3: C_KEY });

    const { geminiKeys } = await import('@/server/config/env');
    expect(geminiKeys).toEqual([A_KEY, B_KEY, C_KEY]);
  });

  it('works when only numbered variants are set and the bare variable is absent', async () => {
    setEnv({ GEMINI_API_KEY6: B_KEY });

    const { geminiKeys, geminiKeyPool } = await import('@/server/config/env');
    expect(geminiKeys).toEqual([B_KEY]);
    expect(geminiKeyPool.next()).toBe(B_KEY);
  });

  it('accepts a key of any shape, because only the network can say a key is bad', async () => {
    setEnv({ GEMINI_API_KEY: 'not-shaped-like-any-google-key' });

    const { geminiKeys } = await import('@/server/config/env');
    expect(geminiKeys).toEqual(['not-shaped-like-any-google-key']);
  });
});

describe('module-load validation', () => {
  it('refuses to boot with no key at all, naming both accepted shapes', async () => {
    setEnv({});

    await expect(import('@/server/config/env')).rejects.toThrow(
      /GEMINI_API_KEY[\s\S]*GEMINI_API_KEY2/,
    );
  });

  it('treats a blank key as no key', async () => {
    setEnv({ GEMINI_API_KEY: '   ' });

    await expect(import('@/server/config/env')).rejects.toThrow(/No Gemini API key/);
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

describe('features', () => {
  it('defaults lawCheck off, so the extra model call is opted into', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY });

    const { features } = await import('@/server/config/env');
    expect(features.lawCheck).toBe(false);
  });

  it('turns lawCheck on for exactly "true"', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, ENABLE_LAW_CHECK: 'true' });

    const { features } = await import('@/server/config/env');
    expect(features.lawCheck).toBe(true);
  });

  it('rejects a value that is neither true nor false rather than guessing', async () => {
    setEnv({ GEMINI_API_KEY: A_KEY, ENABLE_LAW_CHECK: '1' });

    await expect(import('@/server/config/env')).rejects.toThrow(/ENABLE_LAW_CHECK/);
  });
});

describe('geminiKeyPool', () => {
  it('is a single shared pool over the collected keys', async () => {
    setEnv({ GEMINI_API_KEY: `${A_KEY},${B_KEY}` });

    const { geminiKeyPool } = await import('@/server/config/env');
    expect(geminiKeyPool.size).toBe(2);
    expect([geminiKeyPool.next(), geminiKeyPool.next(), geminiKeyPool.next()]).toEqual([
      A_KEY,
      B_KEY,
      A_KEY,
    ]);
  });
});
