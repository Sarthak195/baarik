# Data handling

Referenced by ADR 0006 and ADR 0008. This is the honest version, including the part that
is inconvenient.

---

## The claim on the landing page

> **No signup. No account. No document is stored.**

All three are literally true, and each is verifiable from the repository rather than from
a privacy policy.

| Claim | How to verify it |
|---|---|
| No signup | There is no auth code. No `next-auth`, no Firebase Auth, no session cookie, no login route. `src/app/` has four pages and one POST handler. |
| No account | No user model exists anywhere in `src/` or `data/`. |
| No document stored | No database dependency in `package.json`. No object storage client. Nothing in the request path writes to disk — the only `writeFileSync` in `src/` is in `src/server/samples/golden.ts`, a build-time recorder for the committed sample reports, run by `npm run record:golden` and never by a request. `src/core/**` cannot even import `node:fs` — `eslint.config.mjs` forbids it. |

## What happens to a document

1. It arrives in one HTTP POST to `/analyze` (`src/app/analyze/route.ts`).
2. It is size-checked, sniffed by magic bytes, and parsed into text in memory
   (`src/server/ingest/`).
3. Its SHA-256 is computed as a cache key, and `toCanonicalDocument` blesses one string
   as the authority for every character offset in the system.
4. The text is sent to the Gemini Developer API — **this is the step that leaves the
   machine**, and section 3 below is about it.
5. The model's structured response is verified, scored and composed into an
   `AnalysisReport` entirely offline.
6. The report is held in process memory long enough to serve one `GET /report/<id>`, and
   is returned in the response.
7. The request ends. The text is garbage.

A refresh after the process restarts loses the report. That is the visible consequence of
storing nothing, and the UI says so plainly beside the print control rather than hiding
it.

---

## 1. What is never written down

- **No database.** No SQL, no NoSQL, no ORM, no migration directory.
- **No object storage.** No bucket, no signed URL, no upload directory.
- **No disk writes in the request path.** The one writer in `src/` is
  `src/server/samples/golden.ts`, a build-time recorder for the committed sample reports.
- **No cookies.** Language selection travels in the URL query string
  (`src/i18n/index.ts`), specifically so that no storage is needed and a shared link
  carries its own state.
- **No analytics, no tag manager, no third-party script.**
- **No cross-request state** except an in-memory report map and the expiring map of
  exhausted `(model, key)` pairs in `src/server/genai/exhaustion.ts`, which holds a model
  id and the last eight characters of a key — no document data and no whole credential.

ADR 0008 describes an `AnalysisCache` interface so a shared implementation could be added
later. **No such implementation is wired up.** The interface exists; nothing behind it
does.

## 2. What is logged

**Nothing.** At the time of writing there is no logging in the request path at all:
`pino` is a declared dependency but is imported nowhere in `src/`, and
`no-console` is set to `error` for the whole repository in `eslint.config.mjs`, so a
stray `console.log` of a document fails the build.

ADR 0008 describes the intended design — a structured logger with an **allowlist** of
loggable fields, from which document text, quotes and extracted facts are excluded, with
a unit test asserting it. **That logger is not implemented yet.** The property holds
today by absence rather than by design, which is a weaker guarantee and is stated as such.

`.env.example` already documents the rule the logger will have to obey, because it is the
kind of thing people assume a log level controls:

> *"No level ever causes document text, quotes or extracted facts to be logged. That is a
> property of what the code passes to the logger, not of this setting."*

API keys are never logged either, in whole or in part.
`src/server/config/env.ts` explains why truncation is not a mitigation:

> *"Truncated secrets still leak — a prefix identifies which key was used and a suffix
> narrows a brute force — and a log line is the one artefact that reliably outlives the
> incident that produced it."*

An invalid-environment error therefore names only the **variable**, never the value.

---

## 3. The part that is inconvenient

**Not storing a document is not the same as the document staying private.**

The document text is sent to the **Gemini Developer API**. On Google's **unpaid tier**,
the terms permit Google to use input and output to improve its products, and state that
**human reviewers may read it**.

That is disclosed here, in ADR 0006 and in ADR 0008, in those words, because:

- the premise of this product is that people upload an offer letter carrying their
  salary, a rent agreement carrying their address, or a loan sanction carrying their PAN;
- accurate disclosure scores better than boilerplate, and concealment would be
  indefensible;
- a user who reads "we don't store your document" and infers "nobody sees my document"
  has been misled by omission, and the omission would have been ours.

### What reduces the exposure, and what does not

| | Effect |
|---|---|
| Using the **sample documents** | Zero API calls. Nothing leaves the machine at all — the reports under `golden/reports/` were recorded ahead of time. This is the genuinely private path. |
| **Redacting before pasting** | Works. The grounding verifier matches against whatever text you supply, so replacing a name with `XXXX` costs nothing in analysis quality. |
| A **paid-tier key** | Changes the terms materially. A deployment that sets a billed key is not covered by the unpaid-tier training permission. |
| "We don't store it" | Does **not** reduce what Google receives. |

### What is not sent

- Files are parsed locally by `unpdf` and `mammoth` first; the raw file is sent to the
  model only on the scanned-PDF vision fallback path.
- Classification is sent only the first 4,000 characters of the document.
- No filename is sent. `src/server/ingest/detect.ts` treats the filename as advisory for
  error messages and never dispatches a parser on it.
- No IP address, cookie, device identifier or user identifier is attached to a model
  call, because none is collected.

---

## 4. DPDP Act 2023 posture

The Digital Personal Data Protection Act, 2023 attaches obligations to a Data Fiduciary
that determines the purpose and means of processing personal data.

The design decision that matters here is **not collecting**. There is no consent notice
to serve for storage that does not happen, no retention schedule for data that is not
retained, no erasure workflow for records that do not exist, and no breach-notification
surface because there is no store to breach.

What remains is the transfer in section 3: personal data inside an uploaded document is
processed by a third-party processor (Google) under that processor's own terms. A
production deployment intended for real users rather than for a hackathon evaluation
should:

- run on a **paid tier**, whose terms do not include the training permission;
- publish a notice under s.5 naming the processing and the transfer;
- name a grievance officer under s.13.

None of those is done here, and this document says so rather than implying a compliance
posture the repository does not have.

There is a certain symmetry in that: `data/rubric/tier4-absence.yaml` contains a rule
that fires when a privacy policy names no grievance officer. This project does not name
one either. The difference is that this one says so.

---

## 5. Sample documents contain no real data

Every file under `fixtures/` is synthetic and was written from scratch. Every party,
company, CIN, GSTIN, address, account reference, invoice number, amount and date is
invented; the domain in `privacy-policy-shopapp.txt` sits under `.example.in` and is not a
live service. See `fixtures/README.md` for full provenance.

Nothing in this repository contains a real person's contract.

---

## Related

- ADR 0008 — no accounts, no database, nothing stored
- ADR 0006 — Gemini Developer API only, and the free-tier note
- `SECURITY.md` — threat model, including the PII row
- `DISCLAIMER.md` — legal information, not legal advice
- `docs/LIMITATIONS.md` — privacy restated as a limitation
