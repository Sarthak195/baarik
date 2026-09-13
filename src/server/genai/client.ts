import 'server-only';
import { GoogleGenAI } from '@google/genai';

/**
 * The only file in this repository that imports the Gemini SDK.
 *
 * Confining the import to one module means a breaking SDK change costs one file
 * rather than a search across the codebase, and it makes the blast radius of the
 * pinned version in ADR 0007 visible rather than theoretical.
 *
 * The client is created lazily and memoised: constructing it at module load would
 * make importing any server module fail when the key is absent, which would break
 * `npm run build` on a machine that has no credentials — including CI, which
 * deliberately has none.
 */
let client: GoogleGenAI | null = null;

export function getGenAiClient(apiKey: string): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Discard the memoised client. Used by tests; never called in production. */
export function resetGenAiClient(): void {
  client = null;
}

export type { GoogleGenAI };
