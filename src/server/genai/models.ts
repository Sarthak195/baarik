import 'server-only';

/**
 * Model selection.
 *
 * Three tiers, chosen per call site rather than globally, because the work genuinely
 * differs: deciding whether a document is a lease or an offer letter is a
 * classification a small model does well, while judging whether a clause is absent or
 * merely unclear needs the reasoning of a large one.
 *
 * These ids were chosen by probing the API, not by reading the model list. The two
 * disagree: `models.list` returns `gemini-2.5-flash`, `-flash-lite` and `-pro` for a
 * current key, and every one of them answers a real request with
 *
 *     404 — "no longer available to new users"
 *
 * The list endpoint reports what a key can SEE, which is not the same as what it can
 * CALL. Anything here must be verified by calling it. Measured 13 September 2026:
 *
 *     gemini-3.8-flash        OK    ~12.9s
 *     gemini-3.7-flash        OK     ~5.9s
 *     gemini-3.6-flash        OK     ~5.6s
 *     gemini-3.5-flash        OK     ~5.2s
 *     gemini-3.5-flash-lite   OK     ~4.9s
 *     gemini-3.1-flash-lite   OK     ~4.3s
 *     gemini-2.5-*            404 retired
 */
export const MODELS = {
  /**
   * Full-document reasoning: fact extraction, clause finding, comparison, grounded Q&A.
   * The slowest of the three by some margin, which is why only the stages that need
   * its judgement use it.
   */
  reasoning: 'gemini-3.8-flash',

  /** Classification and per-clause plain-language rewriting — the fastest that works. */
  cheap: 'gemini-3.1-flash-lite',

  /**
   * Degradation target when `reasoning` is rate limited or unavailable. Roughly half
   * the latency of `reasoning`, and stable — no preview model sits on this path.
   */
  fallback: 'gemini-3.5-flash',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/**
 * Gemini 3.x replaced sampling controls with a thinking budget:
 * `temperature`, `top_p` and `top_k` are deprecated on these models and are absent
 * from the SDK's `GenerationConfig` entirely. They are therefore not representable in
 * this codebase's request type, which is the point — a reviewer cannot reintroduce
 * them by habit.
 *
 * `minimal` exists in the API surface but is not supported by these models.
 */
export type ThinkingLevel = 'low' | 'medium' | 'high';
