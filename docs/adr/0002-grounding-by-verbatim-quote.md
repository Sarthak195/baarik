# ADR 0002 — Ground citations by verbatim quote, not by model-reported offsets

**Status:** accepted · **Date:** 2026-09-14

## Context

Every claim Baarik makes about a document must point at the text that supports it.
The obvious implementation is to ask the model for character offsets and highlight
that range.

Language models are unreliable at arithmetic over long strings. A model that quotes a
clause correctly will still report offsets that are tens of characters out, and an
off-by-forty highlight lands on the wrong clause — which is worse than no highlight,
because it looks authoritative.

The stakes are higher than a cosmetic glitch. Indian courts have sanctioned reliance
on fabricated AI citations: ITAT Bengaluru recalled its own order after citing four
non-existent judgments, and the Bombay High Court imposed costs in
*Deepak v Heart & Soul Entertainment* for untraceable AI-generated citations.

## Decision

The model returns a **verbatim quote string**, never an offset. `src/core/grounding`
then locates that string in the canonical document itself, in three passes of
decreasing confidence:

1. **exact** — `indexOf`, the common case;
2. **normalised** — typographic folding (curly quotes, dashes, collapsed whitespace)
   with an offset map, so a match found in fold space reports a range in the original;
3. **fuzzy** — Sørensen–Dice over character bigrams with a coarse-to-fine window scan,
   for OCR noise and a dropped word.

A quote that cannot be located is returned as `unverified` **with a reason**, and an
ambiguous match — two distant candidates within 0.05 Dice of each other — is refused
outright, because citing the wrong clause is worse than citing none.

Dice rather than edit distance: it is O(n + m) with no DP matrix, and the errors that
actually occur degrade it gently rather than off a cliff.

## Consequences

**Good.** Hallucinated clauses cannot reach the user as citations. The guarantee is
deterministic, holds without any network call, and is covered by table-driven tests
including the three refusal paths. `GroundingStats` is part of the API response, so
the mechanism surfaces as a visible product feature — *"17 of 18 findings matched"* —
rather than as invisible plumbing.

It also yields the security property in ADR 0004: a hostile document cannot inflate
its own safety, because suppressed findings show up in the rejection count.

**Costly.** Fuzzy matching is the expensive path. It is bounded by folding the
document once per verification pass rather than once per quote, and by a stride of
one-eighth the needle width in the coarse scan.

**Rejected alternative.** Asking the model for offsets *into the canonical string* and
slicing them ourselves would make quotes verbatim by construction. It was not chosen
because it trades a solvable string-matching problem for an unsolvable arithmetic one.
