# Contributing

The claim this project makes about maintainability is narrow and testable:

> **Adding legal knowledge to Baarik does not require writing TypeScript.**

Risk rules, enforceability verdicts, forums and limitation periods are all data under
`data/`, validated at boot, and greppable by the id that appears next to the finding in
the UI. A lawyer who can read YAML can review a change to any of them in a diff.

The rest of this file is that claim, made concrete.

---

## Add a risk rule in three steps

### Step 1 — pick the tier

| Tier | File | The question the rule asks |
|---|---|---|
| asymmetry | `data/rubric/tier1-asymmetry.yaml` | Is the same right measured differently on the two sides? |
| threshold | `data/rubric/tier2-thresholds.yaml` | Is a number past a number a reader can look up? |
| construct | `data/rubric/tier3-constructs.yaml` | Is a known-bad clause present? |
| absence | `data/rubric/tier4-absence.yaml` | Is a protection that should be here missing? |

### Step 2 — write the rule

Append to the `rules:` list in that file. Every field below is enforced by
`RubricRuleSchema` in `src/core/rubric/schema.ts`.

```yaml
  - id: lock_in_longer_than_six_months
    title: Lock-in longer than six months
    appliesTo: [rent_agreement, employment_offer, freelance_contract]
    when: { op: gt, field: lockInMonths, value: 6 }
    severity: high
    weight: 14
    evidenceFrom: lockInMonths
    askYourLawyer: 'Can the lock-in be shortened, or a buy-out figure agreed instead?'
    explain:
      en: 'You are locked in for {lockInMonths} months. Leaving before that ends is treated as a breach.'
      hi: 'आप {lockInMonths} महीने के लिए बंधे हैं। उससे पहले निकलना अनुबंध का उल्लंघन माना जाएगा।'
```

| Field | Rule |
|---|---|
| `id` | `lower_snake_case`, matched against `/^[a-z0-9_]+$/`. It appears in the UI next to the finding and is the handle a maintainer greps for, so a duplicate id **throws at boot** naming both files. |
| `title` | 1–120 characters. |
| `appliesTo` | Array of `DocumentType`. **Empty means every type.** |
| `when` | A predicate. Vocabulary below. |
| `severity` | `low` \| `medium` \| `high` \| `critical`. |
| `weight` | Positive, at most 50. Contribution to the raw score before tier capping. |
| `evidenceFrom` | Optional. Which fact's citation to surface beside the finding. |
| `askYourLawyer` | Optional but strongly encouraged — it is what the rule becomes when it cannot be evaluated. |
| `explain.en` / `explain.hi` | **Both required.** A rule that exists only in English would silently degrade the Hindi report rather than failing loudly. `{fieldName}` interpolates this document's actual number. |
| `benchmark` | Optional `{ source, url, text }`. Add it **only** where the threshold comes from a published source. Where it is this project's judgement, leave it out — a fabricated citation is worse than an honest bare number. |

### Step 3 — run the gate

```bash
npm run verify
```

That is the whole change. No TypeScript file is edited, no import is added, no test is
written by hand.

---

## The predicate vocabulary

This is the real list, from `src/core/risk/types.ts`. It is deliberately small and
closed: every operator must have a defined answer for missing data, and a larger
vocabulary would make that property harder to hold.

| `op` | Fields | Meaning |
|---|---|---|
| `gte` | `field`, `value` | `field >= value` |
| `gt` | `field`, `value` | `field > value` |
| `lte` | `field`, `value` | `field <= value` |
| `lt` | `field`, `value` | `field < value` |
| `ratio_gte` | `numerator`, `denominator`, `value` | `numerator / denominator >= value` — the asymmetry primitive |
| `multiple_gte` | `field`, `of`, `value`, optional `divideBaseBy` | `field / (of / divideBaseBy) >= value` — e.g. deposit against monthly rent |
| `construct_present` | `construct` | The named construct is in the document |
| `construct_absent` | `construct` | It is not — and answers `unknown` when the document was unclear |
| `field_missing` | `field` | A **number** was not determined. A statement about the extraction, not about the contract |
| `all_of` | `of: [...]` | Kleene AND — one `false` settles it |
| `any_of` | `of: [...]` | Kleene OR — one `true` settles it |
| `not` | `of: {...}` | Kleene NOT — `unknown` stays `unknown` |

### The field vocabulary

`field`, `numerator`, `denominator` and `of` must name one of the 23 numeric fact fields
in `NUMERIC_FACT_FIELDS` (`src/schemas/extracted-facts.ts`):

```
noticeDaysYouMustGive   noticeDaysTheyMustGive   cureDaysYouGet   cureDaysTheyGet
lockInMonths            termMonths               depositRefundDays
paymentTermDays         dataRetentionDays        confidentialityMonths
nonCompeteMonths        monthlyRentInr           securityDepositInr
annualRentIncreasePercent  annualCtcInr          bondAmountInr    bondMonths
principalInr            annualInterestPercent    processingFeePercent
prepaymentPenaltyPercent   latePaymentPercentPerMonth   liabilityCapInr
```

**Units are fixed.** Notice and cure periods are in **days**; lock-in, term,
confidentiality and non-compete are in **months**; money is **rupees as a plain number**.
A threshold like "lock-in longer than six months" is meaningless if the field might be in
days, which is why the schema pins them.

A `satisfies` clause ties `NUMERIC_FACT_FIELDS` to the facts schema, so adding a numeric
field without listing it is a type error — and a rule naming a field that does not exist
fails at **boot**, with the offending value, rather than silently never firing. That
failure mode — a rule that never fires, a predatory contract scoring safe, and nothing
indicating why — is the one this design exists to prevent.

### The construct vocabulary

`construct` must name one of the 20 ids in `ConstructId`
(`src/schemas/extracted-facts.ts`), split into two groups:

**Present-is-bad** — `unilateral_amendment_without_notice`,
`unilateral_arbitrator_appointment`, `contractual_limitation_period`,
`self_help_remedy`, `forfeiture_of_paid_amounts`, `sole_discretion_on_payment`,
`post_employment_non_compete`, `unlimited_indemnity`,
`automatic_renewal_without_notice`, `assignment_of_future_ip`, `class_action_waiver`,
`cross_default`.

**Absent-is-bad** — `deposit_refund_timeline`, `notice_period_for_you`,
`exit_or_termination_route`, `jurisdiction_clause`, `data_retention_limit`,
`liability_cap_in_your_favour`, `rent_increase_cap`, `grievance_officer_named`.

Adding a new construct **is** a code change: the id must go into `ConstructId`, and the
fact-extraction prompt must be taught to look for it. Everything else — which rules use
it, at what weight, for which document types — stays data.

### The one rule about `unknown`

Read `src/core/risk/predicates.ts` before writing a compound predicate. The invariant:

> **If a predicate needs a fact the document did not yield, it answers `unknown` and
> never `false`.**

A rule that answers `unknown` does not vanish. It becomes an `UnknownFact` — a numbered
question in the lawyer-preparation pack, using your `askYourLawyer` wording if you
supplied one. That is why writing a good `askYourLawyer` is worth more than tuning the
weight: it is what the rule does on every document that did not scan cleanly.

See `docs/RISK_RUBRIC.md` for the scoring arithmetic, and ADR 0004 for why the logic is
three-valued.

---

## Add an enforceability row

`data/enforceability/*.yaml`, split by statute for readability and concatenated after
validation by `src/server/knowledge/repository.ts`.

Every row needs:

| Field | Rule |
|---|---|
| `construct` | A `ConstructId`. A verdict is produced **only** when the extractor reports it `present`; `unclear` yields nothing. |
| `verdict` | One of `likely_void`, `likely_unenforceable_as_written`, `capped_by_statute`, `cannot_oust_this_forum`, `enforceable_but_negotiable`, `context_dependent`. |
| `confidence` | `high` \| `medium` \| `low`. |
| `statute.act`, `statute.section` | Exact, as the Act names itself. |
| `statute.text` | The **operative words, quoted**, so the reader is not asked to take it on trust. |
| `statute.url` | Must be `https:` — asserted by a test. Prefer an India Code deep link. |
| `authorities[]` | `cite`, `holding`, `url`. State the holding, not a characterisation of it. |
| `plainMeaning` | One sentence, second person, no jargon. |
| `caveats[]` | **Required and asserted non-empty by a test.** This is the advice boundary in the type system: a verdict may not be shown without what it does not decide. |
| `appliesTo[]` | Document types. Empty means all. |

This work is genuinely slow and cannot be delegated to a model. ADR 0005 says so
directly, and a fabricated citation in a legal tool is the single worst defect this
project could ship — Indian courts have already sanctioned reliance on hallucinated
authorities.

---

## Add a forum or a limitation rule

`data/remedies/forums.yaml` and `data/remedies/limitation.yaml`.

They are checked for **referential integrity at boot**: a forum whose `limitationRuleId`
names a rule that `limitation.yaml` does not define throws, naming both. Showing a reader
a next step with no deadline is the one thing the limitation clock exists to prevent.

A forum row says what the forum does, what the statute provides and what filing costs. It
never says the reader has a claim or will win.

---

## The code rules, when you do touch code

### `src/core` is pure and deterministic

No I/O, no framework, no SDK, no ambient clock, no randomness. This is enforced by
`eslint.config.mjs`, not by convention: `no-restricted-imports` bans `node:*`, `fs`,
`path`, `crypto`, `react`, `next`, `@google/genai`, `yaml`, `unpdf`, `mammoth`, `pino`,
`server-only` and every `@/server`, `@/app`, `@/components`, `@/lib` alias from
`src/core/**`, and `no-restricted-syntax` bans `new Date()`, `Date.now()` and
`Math.random()` there.

If your change needs a file, a socket or the time of day, it belongs in `src/server` and
the result is passed into the core as a parameter. Take `today: Date` as an argument —
see `computeLimitation` in `src/core/remedies/limitation.ts`.

### The model never decides what the law is

Never add a prompt asking whether a clause is valid, void, legal or enforceable. Never
let a model-supplied field reach a risk score without passing `verifyFindings` first. A
document containing a prompt-injection attack must remain unable to change the risk
score — that property comes from the architecture, not from a filter, and there is no
path that may be introduced which breaks it. See `SECURITY.md` §1 and ADR 0003.

### Every prompt carries the guardrails

Compose system instructions with `buildSystemInstruction` from
`src/server/prompts/shared/guardrails.ts`. Never inline a system string.
`tests/unit/server/prompts/guardrails.test.ts` lists every prompt by name — add yours to
that list, or the boundary in ADR 0005 quietly stops applying to your call site.

### Hard limits, enforced in CI

| Rule | Enforced by |
|---|---|
| No file over **250 lines** in `src/` or `scripts/` (tests exempt) | `scripts/check-file-size.mjs` |
| No `generateContent(` anywhere | `scripts/check-forbidden-apis.mjs` |
| No `any`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable` | `scripts/check-forbidden-apis.mjs` |
| No `TODO`, `FIXME`, `XXX`, `HACK` | `scripts/check-forbidden-apis.mjs` |
| No API key or private key in any tracked file | `scripts/check-forbidden-apis.mjs` |
| Repository under 9 MB **including history** | `scripts/check-repo-size.mjs` |
| One branch: `main` | Contest rule |

Split a long file by responsibility rather than raising the cap. The cap exists because a
long file is where unrelated responsibilities accumulate, and also where an LLM reviewer
reading a sampled excerpt loses the thread.

### Comment *why*, never *what*

Every comment in this codebase explains a decision, a trade-off or a failure mode that
was actually encountered. `// increment the counter` has no place here. If a comment
could be deleted without losing information, delete it.

---

## Before you open a pull request

```bash
npm run verify
```

One command, and it is the same gate CI runs:

```
typecheck → lint → validate → test → check:size → check:api → check:repo
```

`npm test` needs no API key and makes no network call — `tests/setup.ts` stubs `fetch` to
throw, and model output is injected through the `LlmGateway` interface
(`src/server/pipeline/stages.ts`) rather than intercepted at the HTTP layer. If a test of
yours throws from that stub, inject a fake gateway; do not relax the stub.

Then:

- Never commit a PDF, image, video or binary. Screenshots go on GitHub's CDN via an issue
  comment, never into git.
- Never commit `.env` or a key. `.env.example` is the template and ships empty.
- Never modify a file under `fixtures/` to "tidy" it. The grounding verifier matches
  against those exact bytes, and `.gitattributes` marks them `-text` for that reason.
- Read `AGENTS.md` if you are an AI agent working in this repository. Several of its rules
  exist because the obvious thing to write from memory is wrong for this stack.

## Conduct

Be accurate about law, and honest about what is not built. An over-claimed capability in
a legal tool is worse than a missing one.
