# Limitations

What Baarik does not do, cannot do, or does not yet do. Specific rather than hedged: a
vague limitation is a limitation nobody can act on.

---

## 1. Scope of law

**Indian law only.** Every statute, judgment, forum, fee and limitation period in
`data/` is Indian. The enforceability table (`data/enforceability/*.yaml`) is built
around the Indian Contract Act 1872, the Consumer Protection Act 2019, the Arbitration
and Conciliation Act 1996, the Specific Relief Act 1963 and the Model Tenancy Act 2021.
Upload a California employment agreement and the analysis will be confidently and
completely wrong, because section 27 has no analogue there and the reasonableness test
that *does* apply is not modelled anywhere in this repository.

**Statute coverage is bounded by what is committed, not by what is retrievable.** There
is no retrieval step and no search grounding on the default path. If a statute is not in
`data/`, the product does not know it exists. Present today: **11 enforceability rows**
across four files, **9 forums**, **7 limitation rules**, **43 rubric rules** across four
tiers. Everything else — Shops and Establishments Acts, state rent-control legislation,
the Industrial Employment (Standing Orders) Act, the Payment of Gratuity Act, the
Companies Act, the whole of tax — is absent. This is a deliberate trade recorded in
ADR 0006: inline committed statute text is reviewable in a diff and cannot fail during
judging, but it does not grow on its own.

**No outcome prediction.** The product will not say whether you would win, what a claim
is worth, or what a court would award. That is a rule, not a gap — see `DISCLAIMER.md`
and ADR 0005, and rule 4 of `src/server/prompts/shared/guardrails.ts`.

**No filing, no representation, no drafting.** It will not file a complaint on your
behalf, will not send a notice, and will not draft an agreement. It shows replacement
wording you could propose, which is a different thing.

**State-level variation is largely unmodelled.** Rent control, stamp duty and
registration requirements vary by state, and the tenancy rows say so in their own
caveats — the Model Tenancy Act 2021 row is explicitly labelled *"a model law circulated
for States to adopt, not binding law unless your State has enacted it"*. The product
does not ask which state you are in and adjust accordingly; it reports the national
position and flags the caveat.

**Legal-aid income ceilings are not committed as data.** `checkLegalAidEligibility` in
`src/core/legal-aid/eligibility.ts` is implemented, unit-tested, and takes a
`LegalAidTable` of per-state ceilings as a parameter. There is no `data/legal-aid/`
directory, and `src/server/knowledge/repository.ts` does not load one. The categorical
grounds under s.12(a)–(g), which do not depend on income at all and cover most people
who will ever use this, are the part that is live.

---

## 2. Document types and formats

**Six document types, plus a degraded seventh.** `src/schemas/document-type.ts`:
`rent_agreement`, `employment_offer`, `loan_agreement`, `nda`, `freelance_contract`,
`privacy_policy`, and `other`. Anything classified `other` gets generic clause analysis
with no tier-4 absence checklist, because absence detection only means something against
a known baseline of what that kind of document should contain.

**Fails on handwritten annexures.** Handwriting is not read. A rent agreement whose rent
and deposit figures are filled in by hand on a printed form will be analysed as though
those clauses are blank — and because the extractor will report the figures as `unclear`
rather than `absent`, the tier-2 threshold rules return `unknown` and become questions
rather than findings. That is the correct failure mode, but it is still a failure: the
most important numbers in the document were the handwritten ones.

**Marathi, Bengali, Tamil, Gujarati and Kannada clauses are not supported.** Input is
handled as English text. A bilingual agreement with a Marathi operative schedule will
have that schedule ignored, and the grounding verifier will reject any quote drawn from
it. Output language is English or Hindi only (`OutputLanguage` is `z.enum(['en', 'hi'])`).

**Scanned documents degrade to page-level citations.** When a PDF's text layer yields
under 200 characters per page (`LIMITS.minPdfCharsPerPage`), `src/server/ingest/pdf.ts`
marks it `likelyScanned`. Character offsets from a vision read are not trustworthy, so
`RawExtraction.offsetsReliable` goes false and citations degrade from a character span to
a page number. Highlighting in the source-document panel will not be exact.

**No OCR pipeline.** There is no Tesseract, no Document AI, no preprocessing. The
scanned fallback is Gemini's native PDF vision and nothing else — see ADR 0006 for why
Document AI was rejected.

**Hard input limits**, all in `src/server/config/limits.ts`: 10 MB upload, 120 PDF pages,
400,000 canonical characters, 200,000 pasted characters, 60 findings, 500-character
question. Exceeding the canonical cap truncates, and `ReportMeta.truncated` surfaces that
to the reader — but a truncated analysis is still a partial one.

**No `.doc`, no `.rtf`, no images.** `src/server/ingest/sniff.ts` detects the legacy OLE
container and refuses it rather than guessing. Encrypted OOXML is detected and refused.
`.gitignore` blocks `*.pdf` and `*.docx` from the repository itself, so every committed
sample is plain `.txt`.

---

## 3. Comparison

**There is no document-versus-document comparison.** You cannot upload two contracts and
diff them. This was cut deliberately: the useful comparison for a consumer who has one
contract in front of them is against a **market and statutory baseline**, not against a
second contract they do not have.

What exists instead: rubric rules carry a `benchmark` with `source`, `url` and quoted
`text` (`BenchmarkSchema` in `src/core/rubric/schema.ts`), so a threshold finding reads
*"the deposit is ten months' rent; the Centre's model tenancy law uses two months as the
benchmark for a home"* with the Act linked. **Four rules currently carry a benchmark**,
all in `data/rubric/tier2-thresholds.yaml`. The rest carry none, deliberately — the file
header says so: *"where it is this project's own judgement it carries none, because a
fabricated citation would be worse than an honest bare number."*

That is an honest four out of 43, and it is the number, not a rounding of it.

---

## 4. What is built but not wired

These are real gaps between what the code contains and what a reader can reach. Stating
them is cheaper than having an evaluator find them.

**Question-answering has no route.** `answerQuestion` in
`src/server/pipeline/stages.ts` is implemented, uses `QaAnswerSchema`
(`src/schemas/qa-answer.ts`) with `foundInDocument` as a first-class refusal, and its
prompt is guardrail-tested. There is no HTTP route that calls it and no UI that exposes
it. The capability is in the pipeline; it is not in the product.

**Per-clause re-explanation has no route.** `src/server/prompts/simplify-clause.ts`
defines `SIMPLIFY_CLAUSE_SYSTEM` and `buildSimplifyClauseInstruction`, both covered by
`tests/unit/server/prompts/guardrails.test.ts`. Nothing calls them. Plain-language
summaries do reach the reader — every finding carries a `plainSummary` from
`src/schemas/finding.ts` — but the on-demand "explain this one again, simpler" control is
not wired.

**Rate limiting is declared, not enforced.** `LIMITS.rateLimit` (capacity 12, refill
4/minute) is defined with a comment explaining what it protects. No middleware applies
it. `grep -rn "rateLimit" src/` returns the definition and nothing else.

**The upload field name does not match the handler.** `src/components/upload/PasteForm.tsx`
sends the file input as `documentFile`; `src/app/analyze/route.ts` reads
`form.get('document')`. The uploaded file is therefore discarded and the handler falls
through to the pasted-text path. **Paste works; file upload does not.** This is a defect,
not a design choice, and it is recorded here rather than papered over.

**Ingest and rate-limit error messages never reach the reader.** The route redirects to
`/?error=…` and `/?refused=…`, but `src/app/page.tsx` reads only `lang` and `understood`.
The carefully worded rate-limit message — *"The sample documents are fully worked and
need no quota"* — is unreachable, and because the redirect drops `understood=1` the
reader lands back on the blocking disclaimer with no indication that anything failed.

**The language switcher discards other query parameters.**
`src/components/ui/SiteFooter.tsx` links to `?` or `?lang=hi`, replacing the whole query
string. Switching language after acknowledging the disclaimer re-blocks the reader.

**The analysis cache interface has no shared implementation.** ADR 0008 describes an
`AnalysisCache` interface behind which a shared implementation could later sit. None is
wired up; the in-memory store is per-process and is lost on restart.

**Only two of the seven fixtures have precomputed reports.** `src/lib/demo/index.ts`
exposes the offer letter and the rent agreement. The loan sanction, the NDA, the
freelance MSA, the privacy policy and the grocery bill exist as fixtures and are exercised
by tests, but selecting them as samples in the UI is not possible because the precomputed
reports do not exist.

---

## 5. The operational limit that shapes everything

**Free-tier Gemini permits roughly 20 requests per day, per model, per key.** Google no
longer publishes the figure; it was found by exhausting it, and
`src/server/genai/gateway.ts` records the discovery. A full analysis spends two reasoning
requests plus one classification, so **one key is about ten analyses.** On a judging day
that is gone by mid-morning.

Three consequences, all visible in the code:

1. **Sample analyses are precomputed.** `src/lib/demo/` holds fully worked reports —
   including a deliberately rejected finding and real `GroundingStats` — so the
   highest-traffic path costs zero quota and cannot fail.
2. **Quota is spread across a key pool and a model ladder.** `src/server/config/key-pool.ts`
   rotates keys and demotes one that answers 429; `MODEL_LADDER` in
   `src/server/genai/models.ts` substitutes a sibling model, which has its own separate
   per-key allowance. Six keys over four reasoning models is roughly twenty times one
   key's capacity, for no money.
3. **Degradation is reported, not hidden.** `GatewayResult.degraded` and
   `ReportMeta.modelsUsed` say which model actually answered.

When everything is exhausted the route fails honestly and points at the samples. It does
not queue, does not retry, and does not pretend.

---

## 6. Limits of the method itself

**The grounding verifier proves existence, not correctness.** It proves the quoted string
appears in your document. It does not prove the model's characterisation of that string
is right. A correctly quoted clause can be wrongly summarised.

**Prompt injection can suppress findings.** It cannot change the risk score — that is
computed in TypeScript from a fixed rubric (see `SECURITY.md`) — and suppression shows up
in the rejection statistics. But a hostile document can still talk the model out of
reporting one of its own clauses.

**Fuzzy matching can refuse a genuine quote.** `LOCATE_DEFAULTS.minSimilarity` is 0.82
and `minQuoteLength` is 24. A short but real clause, or one damaged badly by OCR, is
reported as `unverified` rather than shown. That is the intended direction of error —
a wrong highlight is worse than none — but it costs recall on scanned documents.

**Rubric coverage is finite.** A predatory clause that no rule anticipates scores zero.
ADR 0003 states this plainly and explains why model-generated clause findings are
produced *alongside* the rubric rather than replaced by it.

**Absence detection depends on the extractor having genuinely read the document.** The
tri-state guard (ADR 0004) means an unread document produces questions rather than false
absence findings — but questions are not findings, and a reader gets less from a badly
scanned contract than the interface implies.

**Coverage measurement is scoped.** `vitest.config.mts` measures `src/core/**` only, and
excludes `types.ts` files. That is deliberate — a global figure averaging in framework
glue would overstate what is verified — but it means the reported number says nothing
about `src/server`, `src/app` or `src/components`.

**No integration or end-to-end test exists.** 241 test cases across 24 files, all
unit-level, all in Node. Nothing exercises the HTTP route, the browser, or a real model
call. That is why the upload-field defect above survived to be documented here rather
than caught by CI.

---

## 7. Privacy, restated as a limitation

Nothing is stored (ADR 0008). That is true and verifiable: no database, no object
storage, no accounts.

It is **not** the same as end-to-end privacy. The document is sent to the Gemini
Developer API, and on the unpaid tier Google's terms permit use for product improvement
including human review. `docs/DATA_HANDLING.md` states this in full rather than eliding
it.

A refresh loses your report. There is no history, no sharing, and no cross-device
continuity. Re-analysing costs quota again. For a tool someone uses a handful of times
around signing one contract that is the right trade; for a professional tool used daily
it would not be.
