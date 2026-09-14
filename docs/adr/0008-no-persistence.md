# ADR 0008 — No accounts, no database, nothing stored

**Status:** accepted · **Date:** 2026-09-14

## Context

The documents people bring to a tool like this are among the most sensitive they own:
an offer letter carries their salary, a rent agreement their address, a loan sanction
their PAN. A rational user hesitates before uploading any of it.

Storing documents would buy saved history, shareable reports and re-analysis without
re-upload. It would also create a breach surface, a retention obligation under the
DPDP Act 2023, and a sign-in wall between a first-time visitor and the thing they came
for.

## Decision

No accounts, no sign-in, no database, no object storage. A document exists in the
memory of one request and is never written to disk, to a database, or to a log.

- Analysis results are returned in the response and held in client state.
- Analyses are cached behind an `AnalysisCache` interface with an in-memory LRU keyed
  by document hash plus the language, reading level and any declared type — the things
  that make two requests the same question. It holds at most 50 entries for at most 30
  minutes, the same bounds as the report store and for the same reason. Nothing is
  written to disk, so the promise above is unaffected: this is memory a restart erases.
  A shared implementation could be substituted behind the interface without touching the
  pipeline; none is, because that would require the durable store this ADR forgoes.
- The structured logger has an allowlist of loggable fields. Document text, quotes and
  extracted facts are not among them, and a unit test asserts it.

A refresh therefore loses the report. That is the visible consequence of storing
nothing, and the UI says so plainly next to a "download as Markdown" control — which
doubles as the lawyer-preparation export.

## Consequences

**Good.** "No signup. No account. No document is stored." is the first thing the
landing page says, and it is literally true rather than a privacy-policy euphemism.
There is no breach surface, no retention policy to honour, no sign-in wall in front of
an evaluator, and no session state to debug on demo day. It also removes four Google
integrations (Firestore, Auth, App Check, Remote Config) that would each have cost a
day and added a way for production to fail.

**Costly.** No history, no sharing, no cross-device continuity, and re-analysis costs
tokens again. For a tool someone uses a handful of times around signing one contract,
that is the right trade; for a professional tool used daily it would not be.

**Note.** Not storing documents does not make the analysis private end to end: the
document is still sent to the Gemini API, and on an unpaid tier Google may use it for
product improvement with human review. That is disclosed prominently rather than
elided — see ADR 0006 and `docs/DATA_HANDLING.md`.
