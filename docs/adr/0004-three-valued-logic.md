# ADR 0004 — Three-valued logic: an unknown is never a zero

**Status:** accepted · **Date:** 2026-09-14

## Context

The most useful thing Baarik tells a consumer is often what a contract **does not**
say: no deposit-refund deadline, no notice period, no exit route, no jurisdiction
clause. For an ordinary person the missing protection usually hurts more than any
clause that is present, and essentially no competitor surfaces it.

Absence detection is only sound if two situations are distinguishable:

- the model read the document and the clause genuinely is not there;
- the model could not tell.

Under boolean logic these collapse into the same answer. A scanned rent agreement
nobody could parse would then trip every absence rule at once and be reported as
maximally predatory — confidently, and on no evidence.

## Decision

Facts carry `present | absent | unclear`, and predicates evaluate to
`true | false | unknown` under Kleene strong three-valued logic.

The governing rule: **if a predicate needs a fact the document did not yield, it
answers `unknown`, never `false`.** One definite `false` still settles a conjunction
and one definite `true` still settles a disjunction, so ignorance does not spread
further than it must.

`construct_absent` and `field_missing` are deliberately different operators.
`construct_absent` asks about the *contract* and stays `unknown` when the document was
unclear. `field_missing` asks about the *extraction* and always answers definitely,
because whether a number was determined is always knowable. Conflating them is exactly
the bug this ADR exists to prevent, and it has its own test.

## Consequences

**Good.** A document the extractor read badly produces a short list of questions
rather than a confidently low score — the honest failure mode for a tool people act on.

The unknown path is also productive rather than merely safe. An ungrounded quote
becomes a null fact; a null fact makes a predicate return `unknown`; an `unknown`
becomes a numbered question in the lawyer-preparation pack. **A failure of extraction
surfaces as a question to ask an advocate rather than as a silent wrong answer.**

**Costly.** Every predicate must define its behaviour on missing input, and the
combinators need real truth tables rather than `&&` and `||`. Roughly forty lines more
than the boolean version, and a reviewer must understand Kleene semantics to change it.

**Rejected alternative.** Treating missing data as "rule does not fire". Rejected: it
silently converts ignorance into reassurance, which is the failure mode most likely to
harm someone who trusted the output.
