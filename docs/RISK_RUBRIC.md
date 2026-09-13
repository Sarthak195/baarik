# The risk rubric

Referenced by `src/core/risk/predicates.ts`. This explains how a number between 0 and 100
is produced, and — more usefully — what it is not.

The governing decision is ADR 0003: **the model extracts facts; TypeScript computes
risk.** Nothing here asks a model anything.

---

## 1. Shape

```
extracted facts ──► FactView ──► evaluatePredicate(rule.when, facts) ──► 'true' | 'false' | 'unknown'
                                            │                │                 │
              data/rubric/*.yaml ───────────┘         becomes a driver   becomes a question
                43 rules, 4 tiers                     (points added)     for your advocate
```

- Rules: `data/rubric/tier1-asymmetry.yaml` (8), `tier2-thresholds.yaml` (14),
  `tier3-constructs.yaml` (11), `tier4-absence.yaml` (10) — **43 in total.**
- Scoring configuration: `data/rubric/weights.yaml`.
- Validation: `src/core/rubric/schema.ts`, loaded by `src/core/rubric/load.ts`.
- Evaluation: `src/core/risk/predicates.ts`, `src/core/risk/engine.ts`.

## 2. The four tiers

| Tier | Question it asks | Cap | Example rule |
|---|---|---|---|
| **1 — asymmetry** | *Is the same right measured differently on the two sides?* | 40 | `notice_period_asymmetry_severe` — `noticeDaysYouMustGive / noticeDaysTheyMustGive >= 2` |
| **2 — threshold** | *Is a number in the document past a number a reader can look up?* | 45 | `security_deposit_three_months_rent_or_more` |
| **3 — construct** | *Is a known-bad clause present?* | 45 | unilateral amendment, self-help remedy, cross-default |
| **4 — absence** | *Is a protection that should be here missing?* | 40 | `absent_deposit_refund_timeline` |

Tier 1 is the one worth dwelling on. Each rule divides what one party owes by what the
other owes **for the identical obligation**, so the finding is arithmetic a reader can
check rather than an opinion about fairness. The file header states the convention: *"the
pairing is written in whichever direction costs the reader — notice runs you-over-them,
cure runs them-over-you, and the liability cap is tested both ways."*

Tier 4 is the one nobody else does, and it is sound only because of the tri-state fact
(ADR 0004): *"the whole document was read and this is not in it"* is a different answer
from *"the model did not look"*, and the second yields `unknown`, not a finding.

## 3. The predicate vocabulary

Twelve operators, deliberately closed. The grammar is in `src/core/risk/types.ts` and is
validated by `PredicateSchema` in `src/core/rubric/schema.ts`.

| Operator | Shape |
|---|---|
| `gte` `gt` `lte` `lt` | `field <op> value` |
| `ratio_gte` | `numerator / denominator >= value` — the asymmetry primitive |
| `multiple_gte` | `field / (of / divideBaseBy) >= value` — deposit against monthly rent |
| `construct_present` | a named construct is in the document |
| `construct_absent` | it is not — and stays `unknown` when the document was unclear |
| `field_missing` | a **number** was not determined — a statement about the extraction |
| `all_of` `any_of` `not` | Kleene combinators |

Every operator must have a defined answer for missing data. That requirement is why the
vocabulary is small: a larger one would make the property harder to hold.

### `construct_absent` and `field_missing` are not the same thing

This is the distinction the whole tier-4 design rests on, and it has its own test.

- `construct_absent` asks about the **contract**. If the document was unclear, the answer
  is `unknown`, because "the clause is not in the agreement" and "we could not tell" are
  different claims and only the first is a finding.
- `field_missing` asks about the **extraction**. It always answers definitely, because
  whether a number was determined is always knowable. It exists as a guard for tier-1 and
  tier-2 rules, never as a substitute for `construct_absent`.

Conflating them is exactly the bug ADR 0004 exists to prevent.

### The zero-denominator case

`ratio_gte` has one arithmetic edge worth recording, and `predicates.ts` points here for
the explanation:

```ts
if (denominator === 0) return numerator > 0 ? 'true' : 'unknown';
```

A zero denominator means the other side owes no notice at all. When this side owes
something, that is **maximal** asymmetry — the ratio is unbounded, and answering `false`
or `unknown` would let the worst case in the tier escape unreported. When neither side
owes anything, the comparison is meaningless and `unknown` is the honest answer.

`multiple_gte` takes the opposite decision on a zero base (`unknown`), because a base of
zero there means the rent or CTC was not established rather than that an obligation is
absent.

## 4. From fired rules to a score

`scoreDocument` in `src/core/risk/engine.ts`:

1. Skip rules whose `appliesTo` excludes this document type. Empty `appliesTo` means all.
2. Evaluate `rule.when`. `'true'` → driver; `'unknown'` → `UnknownFact`; `'false'` →
   nothing.
3. Sum each tier's weights and **cap each tier** (`capByTier`).
4. Saturate:

   ```ts
   const score = Math.round(100 * (1 - Math.exp(-raw / input.knowledge.config.saturation)));
   ```

5. Band the score against `weights.yaml`: `<= 24` low, `<= 49` moderate, `<= 74` high,
   else severe.
6. Sort drivers by points, **breaking ties on rule id**, so the output is byte-stable.

### Why saturating rather than linear

A linear score lets a contract with twelve mediocre problems outrank one with a single
catastrophic clause, and it overflows: past a point, every bad contract reads 100 and the
number stops carrying information. `k = 45` is chosen so that one high-severity driver
lands in "moderate" and three land in "high".

### Why the per-tier caps

Without them, eight missing protections would swamp one genuinely dangerous clause. The
caps keep the tiers commensurable: **no single category can carry the score on its own.**

### Why ties break on rule id

Byte-stability. Committed golden reports can be asserted **exactly** rather than
approximately, which is only possible because nothing in the scoring path reads a clock,
a random number or a hash-ordered map.

## 5. What the score is not

- **It is not a probability, a percentage, or a measure of legality.** It is a weighted
  count of rules that fired, compressed onto a 0–100 scale.
- **It is not comparable across document types.** A rent agreement and a privacy policy
  are evaluated against different rule sets; 62 does not mean the same thing on both.
- **It is not a verdict.** Enforceability is a separate output, computed from
  `data/enforceability/*.yaml` by `src/core/enforceability/triage.ts`, and is reported
  with its statute, its authorities and its caveats.
- **It cannot be moved by the document's contents instructing the model.** The rubric is
  not in the prompt and no model output can reach it. See `SECURITY.md` §1.
- **It is bounded by the rules written.** A predatory clause no rule anticipates scores
  zero. This is why model-generated clause findings are produced *alongside* the rubric
  rather than replaced by it — ADR 0003 states the trade explicitly.

## 6. Every number traces to a rule id

`RiskDriver` carries `ruleId`, `tier`, `severity`, `title`, the `explain` template
**rendered against this document's actual numbers**, `points`, the `evidence` quote
location, and `askYourLawyer`.

So "why did this score 62?" is answerable by reading the driver list and grepping the ids
in `data/`. That is the whole point of the design: a number nobody can interrogate is an
assertion, not an analysis.

## 7. Adding or changing a rule

See `CONTRIBUTING.md` — *"Add a risk rule in three steps"*. It requires no TypeScript.
