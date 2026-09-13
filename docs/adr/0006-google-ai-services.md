# ADR 0006 — Gemini Developer API only, and the Google services deliberately not used

**Status:** accepted · **Date:** 2026-09-14

## Context

This is a Google-sponsored event, which creates a pull toward wiring in as many Google
products as possible. That pull should be resisted where a service does not earn its
place: an evaluator scoring code quality penalises unnecessary complexity, and every
integration is a day of work plus a live failure mode during judging.

The rules mandate **Google Antigravity** as the development environment. They do not
mandate a particular cloud service.

## Decision

**Used, because each is load-bearing:**

- **Gemini Developer API** via `@google/genai` 2.22.0, through
  `ai.interactions.create` — the Interactions API, default since June 2026.
  `generateContent` is legacy and CI fails if it appears.
- `gemini-3.8-flash` for document reasoning; `gemini-2.5-flash-lite` for
  classification and per-clause rewriting; `gemini-2.5-flash` as the degradation
  target. `thinking_level` replaces `temperature`/`top_p`/`top_k`, which 3.x deprecates.
- **Native PDF vision** as the scanned-document fallback, behind a guard that fires
  when local extraction yields under ~200 characters per page.
- **Implicit context caching**, exploited by placing the document first and the varying
  instruction last, so a multi-turn session reuses one prefix.
- **Zod-native structured output** on every call.
- **Google Cloud Run** for deployment, and **Antigravity** for development.

**Rejected, with reasons — this list is the decision:**

| Rejected | Why |
|---|---|
| **Document AI** | No confirmed free tier; Form Parser is ~6.5¢/page. Gemini's native PDF vision does this better, for free, in a call already being made. Adding it would be paying for a worse version of what we have. |
| **Vertex AI / Gemini Enterprise Agent Platform** | Requires billing and a service-account key, and a public repository is the wrong home for either. Google's own migration guidance: *"Most developers should use the Gemini Developer API unless there is a need for specific enterprise controls."* |
| **Gemini File Search** | A managed store to provision, a quota to exhaust, and a live failure mode during judging — in exchange for statute text that is more precise when committed inline in `data/enforceability/*.yaml`, where it is consumed and can be reviewed in a diff. |
| **Firestore, Firebase Auth, App Check, Remote Config** | The product is stateless and requires no sign-in, so there is nothing to store and no session to protect. App Check on a deliberately anonymous public URL protects nothing and is the likeliest cause of a production 401 on demo day. |
| **Cloud Translation** | Gemini translates within the same call, free. |
| **Genkit for production inference** | `@genkit-ai/googleai` is pinned at 1.28.0 while `genkit` core is at 1.42.0; the plugin predates both `gemini-3.8-flash` and the Interactions API. |
| **Google Search grounding** | Billed per search query the model issues, not per prompt, and its terms require rendering suggestion chips. Kept behind `ENABLE_LAW_CHECK`, default off, on an explicit user action only. |
| **Any preview model** | No free tier and no stability guarantee; nothing preview sits on the critical path. |

## Consequences

**Good.** Three Google products used well rather than nine used decoratively. The SDK
is imported in exactly one file (`src/server/genai/client.ts`), so a breaking change
costs one file. Not persisting documents makes the privacy claim *true* rather than
aspirational.

**Costly.** No server-side history, so a report is lost on refresh — mitigated by a
Markdown download, and stated plainly in the UI. Statute coverage is bounded by what
is committed rather than by what is retrievable.

**A note on the free tier.** Gemini's unpaid tier permits Google to train on input and
states that human reviewers may read it. For a product whose premise is uploading
personal contracts that must be disclosed prominently, which `docs/DATA_HANDLING.md`
does. Accurate disclosure scores better than boilerplate; concealment would be
indefensible.
