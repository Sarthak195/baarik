import 'server-only';
import { GoogleGenAI } from '@google/genai';

import { LIMITS } from '../config/limits';

/**
 * The only file in this repository that imports the Gemini SDK.
 *
 * Confining the import to one module means a breaking SDK change costs one file
 * rather than a search across the codebase, and it makes the blast radius of the
 * pinned version in ADR 0007 visible rather than theoretical.
 *
 * Clients are created lazily and memoised **per key**. An earlier version memoised a
 * single client on first call, which silently defeated the whole rotation: the first
 * key to arrive was the only credential ever used, `penalise()` reordered a pool that
 * never reached the wire, and the exhausted set recorded pairs against keys that had
 * not been dialled — so its memory was not merely useless but wrong, skipping pairs
 * that were still live. Six keys behaved as one.
 *
 * Lazy rather than eager because constructing at module load would make importing any
 * server module fail without a key, which would break `npm run build` on a machine
 * that has no credentials — including CI, which deliberately has none.
 */
const clients = new Map<string, GoogleGenAI>();

export function getGenAiClient(apiKey: string): GoogleGenAI {
  const existing = clients.get(apiKey);
  if (existing !== undefined) return existing;

  // Without this the SDK waits forever, and "forever" is a real state: a call that
  // never returns sat until Cloud Run killed the request at its own 300-second ceiling
  // and answered a bare 504 — no message, no log line, no fallback, because the ladder
  // in `gateway.ts` never got control back to try another pair. `requestTimeoutMs` was
  // declared for exactly this and its comment says so ("so the failure is ours and
  // carries a message, rather than the platform's and carrying none"); it had only ever
  // been wired into PDF parsing. A healthy reasoning call lands well inside it, so the
  // budget catches a hang without cutting anything short.
  const created = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: LIMITS.requestTimeoutMs },
  });
  clients.set(apiKey, created);
  return created;
}

/** Discard every memoised client. Used by tests; never called in production. */
export function resetGenAiClient(): void {
  clients.clear();
}

export type { GoogleGenAI };
