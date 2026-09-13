import 'server-only';

/**
 * Model selection.
 *
 * Three tiers, chosen per call site rather than globally, because the work genuinely
 * differs: deciding whether a document is a lease or an offer letter is a
 * classification a small model does well, while judging whether a clause is absent or
 * merely unclear needs the reasoning of a large one.
 */
export const MODELS = {
  /** Full-document reasoning: fact extraction, clause finding, comparison, grounded Q&A. */
  reasoning: 'gemini-3.8-flash',
  /** Classification and per-clause plain-language rewriting. */
  cheap: 'gemini-2.5-flash-lite',
  /** Degradation target when `reasoning` returns 429 or 5xx. Stable, never a preview model. */
  fallback: 'gemini-2.5-flash',
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
