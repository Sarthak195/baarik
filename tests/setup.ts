import { vi } from 'vitest';

/**
 * The offline guarantee.
 *
 * Every test in this repository runs with no API key and no network. Model output
 * is replayed from committed fixtures through the `LlmGateway` interface rather than
 * intercepted at the HTTP layer, so no mocking library is needed — and any code path
 * that tries to reach the network fails loudly instead of silently costing money or
 * making the suite flaky.
 *
 * If you are reading this because a test threw here: inject a fake gateway, do not
 * relax this stub.
 */
vi.stubGlobal('fetch', () => {
  throw new Error(
    'Network access is not permitted in tests. Inject a fake via tests/fakes/llm-gateway.ts.',
  );
});
