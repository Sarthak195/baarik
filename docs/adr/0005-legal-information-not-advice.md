# ADR 0005 — Legal information, never legal advice

**Status:** accepted · **Date:** 2026-09-14

## Context

The most striking thing Baarik can tell an Indian employee is that the two-year
non-compete frightening them is void under s.27 of the Indian Contract Act. India has
no "reasonableness" saving test, unlike the UK and US — which is precisely why a
general-purpose chatbot gets it wrong.

Saying so is also the point at which a document analyser starts to look like a lawyer.
Advocates Act 1961 ss.29 and 33, read with *Bar Council of India v A.K. Balaji* (2018),
reserve the practice of law to enrolled advocates, and "practice" covers **non-litigious**
work — advice and documentation, not merely court appearance.

The enforcement precedent worth internalising is *FTC v DoNotPay* (final order
16 January 2025, $193,000 plus subscriber notice). The offence was **over-claiming
capability** — holding the service out as performing like a human lawyer — not
building the tool.

## Decision

The product reports **what a statute provides and what courts have held**. It never
states a conclusion about the reader's own case.

1. **Never a bare verdict.** Not "this clause is void" but "Indian law generally does
   not enforce a clause like this", with the section cited. Citing s.27 is also *more*
   persuasive than asserting voidness, so this costs nothing.
2. **Verdicts come from data, not from the model.** `data/enforceability/*.yaml` rows
   carry `statute.act`, `statute.section`, the quoted operative text, an India Code
   URL, supporting authorities, and **mandatory caveats**. A test asserts caveats are
   non-empty and URLs are https — the advice boundary expressed in the test suite.
3. **A verdict requires `present`.** `unclear` yields nothing. Announcing a clause void
   when the extractor was unsure the clause exists would be worse than silence.
4. **Never predict outcomes.** No "you will win", no "your case is worth ₹X". Allowed:
   what the statute provides, and how forums have treated clauses of this kind.
5. **Three-tier disclaimer**, not one buried footer: a blocking notice at onboarding, a
   compact note on every answer, and a hard interrupt when the document or the user's
   answers indicate a live deadline, an eviction, or a limitation period about to run.
   The interrupt always offers two actions, never a modal with no escape.

## Consequences

**Good.** The regulatory line and the product's credibility point the same way: a cited
section is checkable in ten seconds, and checkability is what separates this from a
chatbot opinion. The escalation path — DLSA, NALSA helpline 15100, Tele-Law — converts
a warning into access rather than leaving the reader alarmed and stuck.

**Costly.** Copy is longer and more hedged than a product person would like, and every
new enforceability row needs a verified citation, which is genuinely slow work that
cannot be delegated to a model.
