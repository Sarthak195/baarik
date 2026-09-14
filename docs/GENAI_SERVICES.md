# Gen AI services used, and where

> **This file is the canonical answer to submission form field 4 — *"Mention the Gen AI
> services utilized in the submission, and where did you utilize it?"*** The summary in
> section 1 below is reproduced verbatim in the form. Section 7 of `README.md` is a
> condensed version of the same content. If any of the three disagree, this file is
> correct and the others are stale.

---

## 1. The form answer, verbatim

**Google Gemini Developer API**, accessed through `@google/genai` 2.22.0 (pinned
exactly, no caret), using the **Interactions API** (`ai.interactions.create`) — the
default surface since June 2026. `generateContent` is legacy and CI fails the build if
the string appears anywhere in the repository.

The SDK is imported in exactly one file: `src/server/genai/client.ts`.

There are **four call sites**, all in `src/server/pipeline/stages.ts`:

1. **Document classification** — `gemini-3.1-flash-lite`, thinking level `medium`
   (default). Decides whether the upload is a legal agreement at all and which of six
   types it is. Sent only the first 4,000 characters.
2. **Fact extraction** — `gemini-3.8-flash`, thinking level **`high`**. Extracts 23
   bounded numeric fields and a `present` / `absent` / `unclear` assertion for each of 20
   named contract constructs. Highest budget because the `absent` versus `unclear`
   judgement decides whether a missing-protection finding is reported at all.
3. **Clause finding** — `gemini-3.8-flash`, thinking level `medium`. Returns each notable
   clause with a **verbatim `exactQuote`**, a plain-language summary at class-8 reading
   level, and who the clause binds and benefits.
4. **Grounded question answering** — `gemini-3.8-flash`, thinking level `low`. Answers
   strictly from the document, with `foundInDocument: false` as a first-class answer.
   *(Implemented as a pipeline stage; not exposed through an HTTP route in this build.)*

Calls 2 and 3 run **concurrently over the identical document prefix**, so the second is
served largely from Gemini's implicit context cache. `Promise.all` in
`src/server/pipeline/analyse-document.ts`.

Also used: **Gemini native PDF vision** as the scanned-document fallback, behind a guard
that fires when local text extraction yields under 200 characters per page;
**Zod-native structured output** on every call, converted by `toGeminiSchema`;
**implicit context caching**, exploited by always placing the document first and the
varying instruction last; and **Google Antigravity** as the development environment, per
`AGENTS.md` and `scripts/antigravity-bridge.mjs`.

**Google Cloud Run** (`asia-south1`, `min-instances=0`, `max-instances=3`) is the
deployment target. No container definition is committed in this repository at the time of
writing, so treat that as a stated intent rather than as something the repository proves.

**What the model is never asked.** It never decides whether a clause is valid, void or
enforceable; it never produces a risk score; it never chooses a forum; it never decides
legal-aid eligibility. All of that is computed in TypeScript from auditable YAML under
`data/`. The model reports what the document says; the code decides what that means.

---

## 2. Call sites in detail

| # | Stage | Function | Model | `thinking_level` | Why this model and this budget |
|---|---|---|---|---|---|
| 1 | Classify | `classifyDocument` | `gemini-3.1-flash-lite` | `medium` (default) | Telling a lease from an offer letter is classification, which a small model does well. Sent only `document.text.slice(0, 4000)` — sending the whole thing to the cheapest model would waste the context the reasoning stages want cached. |
| 2 | Extract facts | `extractFacts` | `gemini-3.8-flash` | **`high`** | *"The judgement this stage makes — 'absent' versus 'unclear' — decides whether a missing-clause finding is reported at all, so it gets the full thinking budget."* |
| 3 | Find clauses | `findClauses` | `gemini-3.8-flash` | `medium` | *"Copying a quote accurately needs less deliberation than deciding whether a clause is truly absent, so this stage runs cheaper than fact extraction."* |
| 4 | Answer a question | `answerQuestion` | `gemini-3.8-flash` | `low` | *"Every follow-up question reuses the same document prefix, so turns after the first are served largely from cache."* |

All four are defined in `src/server/pipeline/stages.ts`. Model ids come from `MODELS` in
`src/server/genai/models.ts`.

### The model ids were probed, not read from a list

`src/server/genai/models.ts` records something worth repeating, because it is the kind of
detail that separates a working integration from a plausible one:

> *"The list endpoint reports what a key can SEE, which is not the same as what it can
> CALL."*

`models.list` returns `gemini-2.5-flash`, `-flash-lite` and `-pro` for a current key, and
every one of them answers a real request with `404 — "no longer available to new users"`.
Every id in `MODELS` and `MODEL_LADDER` was confirmed callable by issuing a request, with
measured latencies recorded in the file (13 September 2026).

### `thinking_level`, not `temperature`

Gemini 3.x deprecates `temperature`, `top_p` and `top_k`; they are absent from the SDK's
`GenerationConfig` entirely. `ThinkingLevel` in `models.ts` is therefore
`'low' | 'medium' | 'high'` and the sampling controls *"are not representable in this
codebase's request type, which is the point — a reviewer cannot reintroduce them by
habit."*

One implementation detail that is easy to get wrong and produces a request the API
accepts and silently ignores: `thinking_level` lives **inside `generation_config`**, not
at the top level. `src/server/genai/interactions.ts` shapes it correctly, having been
written against the SDK's own type declarations rather than the documentation.

---

## 3. Structured output

Every call is schema-constrained, and every response is validated **twice**:

```ts
response_format: {
  type: 'text',
  mime_type: 'application/json',
  schema: toGeminiSchema(request.schema),
},
```

then parsed through Zod on the way back. From `src/server/genai/interactions.ts`:

> *"The second pass is not redundant — constrained decoding guarantees shape, not that
> the model populated a nullable field honestly, and a `safeParse` failure is a clearer
> signal than a downstream `undefined`."*

`toGeminiSchema` prunes twelve validation-only JSON Schema keywords (`minLength`,
`maxItems`, `pattern`, `format`, …) before sending. This was measured, not guessed: each
is accepted in isolation, and the real nested finding schema is refused with a bare
`400 Request contains an invalid argument` until the length and item bounds come out — so
the limit is on combined complexity. Removing them loses nothing, because Zod still
enforces them one step later, in the code that owns the contract rather than in a remote
service. The `.describe()` text, which is the generation guidance that actually matters,
is preserved.

The schemas: `src/schemas/classification.ts`, `src/schemas/extracted-facts.ts`,
`src/schemas/finding.ts`, `src/schemas/qa-answer.ts`.

---

## 4. Caching, and how the request is shaped for it

Gemini's implicit context caching keys on a **shared prefix**, so it only pays off if the
stable part really is a prefix. `StructuredRequest` in
`src/server/genai/interactions.ts` makes that structural rather than conventional:

```ts
/**
 * Large and stable. Sent FIRST, because Gemini's implicit context caching keys on a
 * shared prefix: a multi-turn session over one document reuses this for free, and
 * only if it really is a prefix.
 */
readonly context: readonly ContextPart[];
/** Small and varying. Always LAST, for the same reason. */
readonly instruction: string;
```

`documentContext()` in `stages.ts` builds the document part once and every stage reuses
it. `StructuredResult.cachedTokens` reads `usage.total_cached_tokens` back off the
response when it is reported, defensively — usage reporting is the part of an SDK
response most likely to move between versions, and a missing counter must not fail a
request that otherwise succeeded.

---

## 5. Resilience: the (model, key) ladder

Free-tier quota is counted **per model per key**. `gemini-3.8-flash` allows roughly
twenty requests a day on one key — a figure Google no longer publishes, found by
exhausting it — and a full analysis spends two of them. One key is ten analyses.

A sibling model on the *same* key has its own separate allowance. So
`callWithFallback` in `src/server/genai/gateway.ts` walks both dimensions, cheapest
first:

1. **Another key, same model.** Same quality; the reader sees nothing.
2. **The next model down, from the top key again.** Slightly less capable, its own quota,
   and `GatewayResult.degraded` plus `ReportMeta.modelsUsed` name the model that actually
   answered rather than hiding it.
3. **Fail honestly**, carrying the reason so the route can offer a worked sample instead
   of a stack trace.

Six keys across four reasoning models is roughly twenty times one key's capacity, for no
money and no waiting. Retrying the same pair is never a strategy: the quota is daily, so
any wait long enough to matter is longer than a person will sit in front of a page.

Exhausted `(model, key)` pairs are remembered in `src/server/genai/exhaustion.ts`: a map
hung off a `globalThis` symbol, for the reason `report-store.ts` documents at length. Next
bundles route handlers into separate server chunks, so a module-level `Map` would give
`/analyze` and `/api/ask` a private copy each — silently, because a memory that never hits
looks exactly like a memory that is not needed. Sharing it process-wide is what stops every
request re-discovering this morning's exhausted models one 429 at a time.

Which failure is written into that memory is the distinction that matters:

| Failure | Remembered for | Why |
|---|---|---|
| `rate_limited` (429) | `QUOTA_TTL_MS` — **one hour** | The allowance is daily and the reset boundary is unpublished, so an hour is simply the price of finding out whether it has turned. Erring long is deliberate: a stale ban costs one rung on a ladder built to absorb exactly that, while expiring early puts the wasted round trip back on the critical path of somebody's upload. |
| `model_unavailable` (404) | `RETIREMENT_TTL_MS` — **six hours** | A retirement is not undone at midnight, so it deliberately outlives a quota ban. Not for ever, because the evidence is one status code from an SDK with no stable error taxonomy. Recorded against the pair that saw it rather than the model, since the keys are separate projects. |
| `unavailable` (5xx) | **never** | A fault expected to clear in seconds, written into an hour-long memory, would outlive the blip and make this process the outage. `KeyPool.penalise` is the right-sized response, and it has already happened. |

A `model_unavailable` error also breaks out of the key loop immediately, because a retired
model fails identically on every key of the same project. A malformed request or schema
violation is rethrown at once — *"our bug and will reproduce everywhere. Surfacing it
immediately beats burning quota confirming it."*

`MODEL_LADDER` deliberately encodes no model's limit, because those are unpublished and
change: it discovers exhaustion by being told, and keeps that belief until its TTL says it
is stale enough to be worth re-testing.

---

## 6. Considered and deliberately not used

This list is the decision, not an appendix. This is a Google-sponsored event, which
creates a pull toward wiring in as many Google products as possible — and an evaluator
scoring code quality penalises unnecessary complexity, while every integration is a day
of work plus a live failure mode during judging.

| Rejected | Why |
|---|---|
| **Document AI** | No confirmed free tier; Form Parser is around 6.5¢ per page. Gemini's native PDF vision does this better, for free, inside a call already being made. Adding it would be paying for a worse version of what we already have. |
| **Vertex AI / Gemini Enterprise Agent Platform** | Requires billing and a service-account key, and a public repository is the wrong home for either. Google's own migration guidance: *"Most developers should use the Gemini Developer API unless there is a need for specific enterprise controls."* There is no such need here. |
| **Gemini File Search** | A managed store to provision, a quota to exhaust and a live failure mode during judging — in exchange for statute text that is *more* precise when committed inline in `data/enforceability/*.yaml`, where it is consumed, reviewable in a diff, and cannot 500. |
| **Firestore** | The product is stateless and stores nothing (ADR 0008). There is nothing to put in it. |
| **Firebase Authentication / Anonymous Auth** | There is no account, no session and no per-user state. A sign-in wall in front of an evaluator is a cost with no benefit. |
| **Firebase App Check** | App Check on a deliberately anonymous public URL protects nothing, and is the single likeliest cause of a production 401 on demo day. |
| **Firebase Remote Config** | Two feature flags, both resolved from the environment at boot in `src/server/config/env.ts`. A remote service to change two booleans is not a trade worth making. |
| **Genkit for production inference** | `@genkit-ai/googleai` is pinned at 1.28.0 while `genkit` core is at 1.42.0; the plugin predates both `gemini-3.8-flash` and the Interactions API. Using it would mean writing against an older surface than the one the SDK exposes directly. |
| **Google Search grounding** | Billed per search query the model issues, not per prompt, and its terms require rendering suggestion chips. Not on the default path. `ENABLE_LAW_CHECK` exists in `src/server/config/env.ts` and defaults to `false` as the switch it would sit behind, but **no search-grounded call site is implemented** — `features.lawCheck` is resolved and currently has no consumer. |
| **Cloud Translation** | Gemini translates inside the same call, free. And the translation that matters here is of *interface strings*, which is a data problem solved by `src/i18n/en.ts` and `src/i18n/hi.ts`, not an API problem. |
| **Any preview model** | No free tier and no stability guarantee. Nothing preview sits on the critical path. |

**Used, because each is load-bearing:** the Gemini Developer API, Gemini native PDF
vision, implicit context caching, and Google Antigravity. Google Cloud Run is the
deployment target.

Three Google products used well beats nine used decoratively — and the SDK being confined
to one file means a breaking change costs one file rather than a search across the
codebase.

---

## 7. Antigravity

Google Antigravity is the mandated development environment and is used as one.

- `AGENTS.md` at the repository root is the agent contract — natively recognised by
  Antigravity, and the document that stops an agent writing `generateContent` from
  memory, breaking the pure-core boundary, or letting a model decide what the law is.
- `scripts/antigravity-bridge.mjs` drives Antigravity's `agentapi` gRPC surface so agent
  tasks can be fanned out and polled from a terminal. The endpoint is ephemeral, so the
  script rediscovers it on every invocation.

---

## 8. The free-tier disclosure

Gemini's unpaid tier permits Google to use input for product improvement and states that
human reviewers may read it.

For a product whose premise is that people upload personal contracts, that must be
disclosed prominently, and it is — in `docs/DATA_HANDLING.md`, in ADR 0006 and in
ADR 0008. Accurate disclosure scores better than boilerplate, and concealment would be
indefensible.

Not storing documents is true and verifiable. It is not the same as the analysis being
private end to end, and the documentation does not conflate the two.
