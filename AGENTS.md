# Agent contract — Baarik

Rules for any AI agent working in this repository, including Google Antigravity
agents and the Claude Code session that scaffolded it. These are not style
preferences: several of them exist because the obvious thing an agent will do from
memory is wrong for this stack.

## 1. The Gemini API surface has moved — do not write `generateContent`

The **Interactions API** became the default in June 2026. `generateContent` is legacy.
Model training data predates this, so an agent asked to "call Gemini" will almost
always emit the wrong call.

```ts
import { GoogleGenAI } from '@google/genai'; // pinned 2.22.0, no caret
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
  model: 'gemini-3.8-flash',
  input: '…',
});
```

`scripts/check-forbidden-apis.mjs` fails CI if `generateContent(` appears anywhere.

Related, and equally easy to get wrong from memory:

- `gemini-3.8-flash` **deprecates `temperature`, `top_p` and `top_k`**. Use the
  `thinking_level` enum: `'low' | 'medium' | 'high'`. `'minimal'` is not supported.
- Put the **document first and the varying instruction last** in every request.
  Implicit context caching is on by default above 4,096 tokens and only helps if the
  stable prefix really is a prefix.
- Structured-output schemas must stay shallow — one object wrapping flat arrays of
  flat objects. Deeply nested schemas are rejected by the API.

## 2. `src/core` is pure and deterministic

No I/O, no framework, no SDK, no ambient clock, no randomness. Every legal decision
the product makes lives there so that it can be tested with no network and no API key.

This is enforced by `eslint.config.mjs`, not by convention. If a change needs a file
read, an HTTP call or the current time, it belongs in `src/server` and the result is
passed into the core as a parameter. Take `today: Date` as an argument.

## 3. The model never decides what the law is

A model interprets the document. Enforceability verdicts, risk scores, absence
detection, forum routing and legal-aid eligibility are computed in TypeScript from
declarative data under `data/`.

Consequences an agent must preserve:

- Never add a prompt that asks the model whether a clause is valid, void or legal.
- Never let a model-supplied field flow into a risk score without passing the
  grounding verifier first.
- A document containing a prompt-injection attack must remain unable to change the
  risk score. That property comes from the architecture, not from a filter — do not
  introduce a path that breaks it.

## 4. Every claim about the document carries a verbatim quote

`src/core/grounding` checks that a model-supplied `exactQuote` genuinely appears in
the canonical document before it is rendered as a citation. Findings that fail are
shown as unverified — **never silently dropped**, because hiding the failure rate is
worse than reporting it.

## 5. Legal safety

Output is legal **information**, never advice. Advocates Act 1961 ss.29/33 and
*BCI v A.K. Balaji* (2018) reserve non-litigious legal advice to enrolled advocates.

- Never emit a bare "this clause is void". Say what the statute provides and cite the
  section.
- Never predict an outcome ("you will win", "you will get ₹X").
- Every enforceability row requires a `statute.url` and at least one caveat. A test
  enforces this.

## 6. Repository hygiene

- **One branch: `main`.** Contest rule.
- **Under 10 MB including history.** Never commit PDFs, images, video or fixtures
  larger than a few KB. Screenshots go on GitHub's CDN via an issue comment, never
  into git.
- No `any`, `@ts-ignore`, `eslint-disable`, `TODO` or `FIXME` — CI greps for them.
- No file over 250 lines.
- Comment *why*, never *what*.

## 7. Working with Antigravity from the command line

`scripts/antigravity-bridge.mjs` drives Antigravity's `agentapi` gRPC surface so
agent tasks can be fanned out and polled from a terminal. The endpoint is ephemeral,
so the script rediscovers it on every invocation.

```bash
node scripts/antigravity-bridge.mjs discover
node scripts/antigravity-bridge.mjs new --model=pro "<task prompt>"
node scripts/antigravity-bridge.mjs status <conversationId>
node scripts/antigravity-bridge.mjs send <conversationId> "<follow-up>"
```

Antigravity IDE must be running. Its free tier caps agent invocations weekly with no
credit pool, so batch substantive work rather than spending invocations on trivia.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
