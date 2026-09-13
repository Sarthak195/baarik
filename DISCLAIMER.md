# Legal information, not legal advice

Baarik is a document-analysis tool. It reports **what a document says** and **what an
Indian statute provides**. It does not tell you what to do, and it is not a substitute
for an advocate.

Nothing in this repository or in the deployed application creates a lawyer–client
relationship, and nothing in it is privileged.

---

## Why the line is drawn here, and not somewhere more convenient

The most useful sentence this product can say to an Indian employee is that the
two-year non-compete in their offer letter is void under section 27 of the Indian
Contract Act, 1872. India has no "reasonableness" saving test for post-employment
restraints, unlike England and most of the United States — which is precisely why a
general-purpose chatbot, reasoning from a training corpus dominated by US and UK
material, gets this wrong.

Saying that is also the moment a document analyser starts to resemble a lawyer.

**Advocates Act, 1961, sections 29 and 33** reserve the practice of law to advocates
enrolled on a State Bar Council roll. In *Bar Council of India v A.K. Balaji*
(Supreme Court, 13 March 2018) the Court confirmed that "practice" is not confined to
appearing in court: **non-litigious work — advice, opinions, drafting and transactional
work — is practice too.** A tool that issues legal conclusions about a particular
person's particular contract is on the wrong side of that line, however it is branded.

The enforcement precedent worth internalising is *FTC v DoNotPay* (final consent order,
16 January 2025 — USD 193,000 and mandatory notice to subscribers). The Commission's
objection was **over-claiming capability**: the service was held out as performing like
a human lawyer. The offence was the claim, not the software.

So the boundary is not a footer. It is a design constraint, and it is enforced in four
places in the code.

---

## The four rules, and where each is enforced

### 1. Never a bare verdict

Not *"this clause is void"* but *"Indian law generally does not enforce a clause like
this"*, with the section cited and quoted.

This costs nothing rhetorically — citing s.27 and quoting its operative words is *more*
persuasive than asserting voidness, because the reader can check it in ten seconds.

Enforced in the prompt layer, in `src/server/prompts/shared/guardrails.ts`:

> `4. Never state that anything is legal, illegal, valid, void or enforceable.`
> `   Enforceability is assessed elsewhere in this system from a fixed table of statutes.`

`buildSystemInstruction` in that file composes **every** system instruction in the
application. `tests/unit/server/prompts/guardrails.test.ts` lists all five system
prompts by name and asserts that each carries the guardrail block verbatim, carries the
untrusted-input notice, and places the guardrails *before* the task instruction. Adding
a sixth prompt without them fails the build.

### 2. Verdicts come from data, never from the model

Enforceability verdicts are produced by `triageEnforceability` in
`src/core/enforceability/triage.ts`, which is deliberately dull: it looks up rows,
filters by document type and attaches evidence. Every legal judgement it reports lives
in `data/enforceability/*.yaml`, where each row carries:

| Field | Why it is mandatory |
|---|---|
| `statute.act`, `statute.section` | So the claim is attributable |
| `statute.text` | The operative words, quoted, so the reader is not asked to take it on trust |
| `statute.url` | Preferably an India Code deep link, so it is checkable |
| `authorities[]` | `cite`, `holding` and a URL for each supporting judgment |
| `plainMeaning` | One sentence, second person, no jargon |
| `caveats[]` | **Required and asserted non-empty by a test** |

The `caveats` requirement is the advice boundary expressed in the type system. See the
comment on `EnforceabilityRule.caveats` in `src/core/enforceability/types.ts`:

> *"Required and asserted non-empty by a test. This is the advice boundary expressed in
> the type system: a verdict may not be shown without what it does not decide."*

`tests/unit/core/enforceability/triage.test.ts` enforces it.

### 3. A verdict requires `present`, never `unclear`

`triageEnforceability` produces a verdict only when the extractor reported the construct
as `present`:

```ts
if (input.facts.construct(rule.construct) !== 'present') continue;
```

`unclear` yields nothing. Announcing that a clause is commonly held void when the
extractor was not sure the clause exists would be worse than silence — and under the
three-valued logic of ADR 0004, `unclear` is a real state rather than a soft `false`.

### 4. Never predict an outcome

No "you will win". No "your case is worth ₹X". No estimate of damages.

What is permitted: what the statute provides, what courts have held in the cited
authorities, which forum hears this kind of matter, what it costs to file there, and how
long the limitation period runs. That last one — `src/core/remedies/limitation.ts` — is
the difference between a warning and access.

---

## The three-tier disclaimer

One disclaimer in a footer is a disclaimer nobody reads. Baarik shows three, at the
three moments where the reader's understanding of what they are looking at can actually
go wrong.

| Tier | When | Component | What it does |
|---|---|---|---|
| **Onboarding notice** | Before the first analysis | `src/components/disclaimer/OnboardingNotice.tsx` | States plainly that this is information, not advice, and that no document is stored |
| **Per-answer note** | On every report and every answer | `src/components/disclaimer/PerAnswerNote.tsx` | A compact, non-dismissible note attached to the output itself, so it survives a screenshot |
| **Time-sensitive interrupt** | When a limitation period is running | `src/components/disclaimer/TimeSensitiveInterrupt.tsx` | A hard interrupt when the document or the reader's answers indicate a live deadline, an eviction, or a limitation period about to expire |

The interrupt always offers two actions and is never a modal with no escape. A person
facing eviction in eleven days should meet a route to a District Legal Services
Authority, not a dialog box they have to dismiss to get back to reading.

---

## What Baarik will not do

- It will not tell you whether to sign.
- It will not predict whether you would win.
- It will not value your claim.
- It will not file anything on your behalf, or represent you anywhere.
- It will not draft a contract for you. It will show you replacement wording you could
  propose, which is a different thing.
- It will not answer from general knowledge. If your document is silent on a point, it
  says so — see `src/schemas/qa-answer.ts`, where `foundInDocument: false` is a
  first-class answer with its own schema field, not an error path.

## What it does instead

- Explains each clause in plain language, with the clause text quoted verbatim.
- Names the statute and quotes its operative words.
- Cites the judgment and states its holding.
- Says what the document does **not** say.
- Turns everything it could not determine into a numbered question for your advocate —
  see `UnknownFact` in `src/core/risk/types.ts`.
- Routes you to the forum that hears this kind of matter, with its fee, its filing
  portal and its limitation deadline — `data/remedies/forums.yaml`.
- Checks whether you are entitled to a free advocate under section 12 of the Legal
  Services Authorities Act, 1987 — `src/core/legal-aid/eligibility.ts`.

## If you need a lawyer and cannot pay for one

Free legal services under the Legal Services Authorities Act, 1987 are far wider than
most people believe. Section 12 entitles, **irrespective of income**:

- every woman and every child — s.12(c);
- members of a Scheduled Caste or Scheduled Tribe — s.12(a);
- industrial workmen — s.12(f);
- persons with a disability or mental illness — s.12(d);
- victims of trafficking or begar — s.12(b);
- persons in custody — s.12(g);
- persons in circumstances of undeserved want — s.12(e).

Plus anyone under the income ceiling for the relevant forum — s.12(h).

- **NALSA helpline: 15100**
- **NALSA: https://nalsa.gov.in/**
- Your District Legal Services Authority sits in the district court complex.

---

## Accuracy, and its limits

This product can be wrong. Statutes are amended, judgments are distinguished and
overruled, and the analysis rests on a language model reading a document.

- Every enforceability row, forum and limitation rule carries the date it was verified
  and a URL you can check it against.
- Statute coverage is bounded by what is **committed** to `data/`, not by what exists.
  See `docs/LIMITATIONS.md` for the specifics of what is out of scope.
- The grounding verifier (`src/core/grounding/verify.ts`) refuses to render a citation
  it cannot find in your document, and reports how many it refused.

None of that makes the output advice. Take a printed report to an advocate; that is what
it is built for.

---

*Baarik is licensed under Apache-2.0. See `LICENSE`. The synthetic sample contracts under
`fixtures/` are deliberately one-sided teaching examples and must never be reused as
drafting precedent — see `fixtures/README.md`.*
