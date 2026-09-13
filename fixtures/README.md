# `fixtures/` — synthetic sample documents

## Provenance

**Every document in this directory is entirely synthetic and was written from scratch
for this project.**

- No text was copied from any real agreement, law-firm template, published precedent,
  contract-drafting book, website or dataset. There is no third-party copyright in
  these files.
- Every party, person, company, CIN, GSTIN, address, bank account reference, invoice
  number, amount and date is invented. Any resemblance to a real company or person is
  coincidental. The domain used in `privacy-policy-shopapp.txt` is under
  `.example.in` and is not a live service.
- The legal defects are **planted deliberately** so that the analysis pipeline has
  something specific and findable to report. These are examples of what a one-sided
  Indian consumer or employment document looks like — they are **not** model clauses
  and must never be reused as drafting precedent.

## What these files are for

They serve three purposes at once:

1. **Demo content.** The sample chips in the product load these files.
2. **Test fixtures.** Unit and integration tests assert against them.
3. **Input to the committed golden reports.** The JSON under `golden/` is the recorded
   output of the pipeline over exactly these bytes. Changing a single character in any
   file here invalidates the corresponding golden report and will fail
   `golden/reports.test.ts` until the report is re-recorded.

### Byte stability

`.gitattributes` marks `fixtures/**/*.txt` as `-text`, so git performs no line-ending
conversion. All files are plain UTF-8 with LF line endings. The grounding verifier
matches model-supplied quotes against these exact bytes, so **do not reflow, re-wrap
or re-indent** an existing file to "tidy" it.

No PDFs, images or other binaries live here, by design — the repository is capped at
10 MB and `.gitignore` blocks binary formats.

## The files

| File                             | Type                     | What it is planted to exercise                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `offer-letter-meridian.txt`      | `employment_offer`       | **Hero sample.** 24-month post-employment non-compete; ₹2,00,000 training bond over 24 months; 90-day employee notice against 30-day employer notice (3:1); unilaterally appointed sole arbitrator; 6-month contractual limitation bar; over-broad IP assignment plus assignment of moral rights; unpaid garden leave. Five deliberate absences drive the "Missing" tab. |
| `rent-agreement-koramangala.txt` | `rent_agreement`         | 11-month leave and licence with a 10-month security deposit, full deposit forfeiture on early exit, 10% escalation, unrestricted landlord entry, all repairs (including structural) on the tenant, and jurisdiction in a city where the tenant does not live.                                                                                                            |
| `personal-loan-sanction.txt`     | `loan_agreement`         | Floating-rate personal loan with a 4% foreclosure charge, monthly-compounding penal charges, recall-on-demand, an arbitration clause purporting to oust the consumer forum, cross-default and set-off, and a ~38% effective APR against a 28% headline rate. Exercises the deterministic cost-of-credit calculator.                                                      |
| `nda-mutual-but-not.txt`         | `nda`                    | **Asymmetry demo.** Titled "Mutual" but every obligation runs one way. Perpetual confidentiality on ordinary business information, the standard exclusions expressly negated, a 5-year non-solicit inside an NDA, one-way injunctive relief and one-way indemnity. Short enough to read on screen beside the meter.                                                      |
| `freelance-msa.txt`              | `freelance_contract`     | Unlimited revisions; payment 90 days after an approval that is at the client's sole discretion; IP assigned on signature rather than on payment; moral rights waived and portfolio use barred; uncapped, unlimited-in-time indemnity; termination for convenience with no payment for delivered work; **no late-payment interest clause at all.**                        |
| `privacy-policy-shopapp.txt`     | `privacy_policy`         | Unilateral amendment with no notice; sharing with unnamed "affiliates and partners"; retention "as long as necessary" with no period; **no grievance officer named**; Singapore-seated arbitration; class-action waiver; 180-day claim bar.                                                                                                                              |
| `grocery-bill.txt`               | _(not a legal document)_ | **Negative sample.** An ordinary supermarket receipt with items, HSN codes, a GST summary and a UPI reference. Drives the "this doesn't look like a legal agreement" refusal path and is the fixture for input-type rejection.                                                                                                                                           |

## Planted issues, by statute

Ordered by file so that the enforceability rules under `data/` can be cross-checked
against what actually exists in the text.

### `offer-letter-meridian.txt`

| Clause     | Planted issue                                                                                                           | Authority the rule should cite                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 7.1–7.3    | 24-month post-employment non-compete over "any competing business in the territory of India"                            | s.27 Indian Contract Act 1872; _Niranjan Shankar Golikari_ (1967); _Varun Tyagi v Daffodil Software_ (Del HC 2025) |
| 6.2–6.3    | ₹2,00,000 bond payable in full regardless of service completed                                                          | s.74 ICA; _Kailash Nath Associates v DDA_ (2015); _Vijaya Bank v Prashant B Narnaware_ (2025)                      |
| 5.1 vs 5.2 | Notice asymmetry, 90 days against 30 days (ratio exactly 3.0)                                                           | Tier-1 asymmetry probe `notice_days_you / notice_days_them`                                                        |
| 5.3        | Unpaid garden leave over a 90-day notice period                                                                         | Tier-3 known-bad construct; wage-payment framing under the Code on Wages 2019                                      |
| 11.1       | Sole arbitrator appointed by the Managing Director of the Company                                                       | _Perkins Eastman v HSCC_ (2019); s.12(5) + Seventh Schedule, A&C Act 1996                                          |
| 11.2       | Arbitration costs on the party raising the dispute regardless of outcome                                                | Tier-3 asymmetry; s.31A A&C Act 1996 on costs                                                                      |
| 11.3       | No claim entertained, and rights extinguished, after six (6) months                                                     | s.28(b) ICA                                                                                                        |
| 10.1       | IP assignment reaching inventions made outside working hours, off the Company's premises, and unrelated to its business | Over-breadth; contrast s.27 ICA reasoning and s.19 Copyright Act 1957                                              |
| 10.3       | Irrevocable assignment of moral rights                                                                                  | s.57 Copyright Act 1957 — moral rights are not assignable                                                          |
| 8.1        | 12-month non-solicit                                                                                                    | Narrower than 7.1; the contrast is the teaching point                                                              |
| 11.4       | Exclusive Bengaluru jurisdiction                                                                                        | Read against s.34(2)(d) CPA 2019 where a consumer forum is available                                               |
| 4.1        | Unpaid work beyond normal hours and on weekends                                                                         | Code on Wages 2019; state Shops and Establishments Act overtime                                                    |
| 3.1        | Annual CTC ₹12,00,000 with no salary breakup                                                                            | Feeds the bond-to-CTC ratio (₹2,00,000 = 2 months' CTC)                                                            |

**Deliberately absent from this file** (the Tier-4 absence checklist should report all
five as `absent`, not `unclear`): employer-side termination grounds (clause 5.2 gives
a notice period but never says on what grounds the Company may act); any notice
buyout or shortfall rate; treatment of the stock options mentioned at clause 3.3 on
exit; any commitment to issue a relieving or experience letter; any reference to
provident fund, gratuity or ESI.

### `rent-agreement-koramangala.txt`

| Clause  | Planted issue                                                                                                                                    | Authority the rule should cite                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 3.1     | Security deposit of ₹3,00,000 = ten (10) months' rent                                                                                            | CPA 2019 s.2(46)(i) unfair contract term; Model Tenancy Act 2021 s.11 caps residential deposits at two months                 |
| 4.2     | Total forfeiture of the deposit on exit during the 11-month lock-in                                                                              | s.74 ICA (forfeiture must be a genuine pre-estimate); Tier-3 forfeiture construct                                             |
| 2.2     | 10% escalation on an 11-month term                                                                                                               | Tier-2 threshold (> 10% p.a. HIGH, 8–10% MEDIUM)                                                                              |
| 2.3     | 3% per month interest on late rent (36% p.a.) against no reciprocal obligation on the landlord                                                   | Tier-1 asymmetry; Tier-2 penal-charge threshold                                                                               |
| 6.1     | Tenant bears all repairs including structural, roof and slab                                                                                     | s.108(f) and (m) Transfer of Property Act 1882 allocate structural repairs to the lessor                                      |
| 8.1     | Landlord entry "at any time, without notice"                                                                                                     | MTA 2021 s.23 requires 24 hours' written notice; Tier-3 self-help construct                                                   |
| 9.1–9.2 | Landlord may determine on 15 days' notice on his own opinion of breach, with 3× daily rent for holding over, while the tenant has no exit at all | Tier-1 termination-rights asymmetry; s.23 ICA / _Brojo Nath Ganguly_ (1986)                                                   |
| 11.2    | Exclusive jurisdiction at Udupi — neither the premises nor the tenant is there                                                                   | Tier-3 "jurisdiction in a city unrelated to the dispute"; CPA 2019 s.34(2)(d)                                                 |
| 1.1     | 11-month term, unregistered                                                                                                                      | Registration Act 1908 s.17(1)(d) / s.49 — the 11-month device; note the Maharashtra s.55 MRC Act 1999 exception in the caveat |

**Deliberately absent:** any deposit-refund timeline, any maintenance or repair split
between the parties, any exit route for the licensee before the lock-in expires, any
inventory or handover schedule, and any forum convenient to the tenant.

### `personal-loan-sanction.txt`

| Clause   | Planted issue                                                                                                                  | Authority the rule should cite                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 3.2      | 4% foreclosure charge on a floating-rate personal loan to an individual for a non-business purpose, sanctioned 4 February 2026 | RBI (Pre-payment Charges on Loans) Directions, 2025 — applies to loans sanctioned or renewed on or after 1 January 2026 |
| 3.1, 3.3 | 12-month foreclosure lock-in and a bar on part-prepayment                                                                      | Same Directions                                                                                                         |
| 2.1      | Penal charges of 3% per month compounded monthly (~42.6% p.a. effective)                                                       | RBI Fair Practices Code on penal charges — penal charges must not be capitalised; Tier-2 penal-charge threshold         |
| 4.1      | "Repayable on demand notwithstanding the tenure" with no default                                                               | s.23 ICA unconscionability; _Brojo Nath Ganguly_ (1986)                                                                 |
| 7.1      | Sole arbitrator nominated by the Lender                                                                                        | _Perkins Eastman_ (2019); s.12(5) A&C Act 1996                                                                          |
| 7.2      | Purports to bar the borrower from any consumer forum                                                                           | _Emaar MGF Land v Aftab Singh_ (2018) — consumer disputes are not arbitrable                                            |
| 7.3      | 90-day contractual limitation on claims against the Lender                                                                     | s.28(b) ICA                                                                                                             |
| 5.1–5.2  | Cross-default across every account with the lender and its group, plus set-off without notice                                  | Tier-3 known-bad construct                                                                                              |
| 1.1      | Rate revision effective on website publication, with deemed notice                                                             | CPA 2019 s.2(46)(iv)/(vi) unilateral variation                                                                          |
| Part A   | Headline 28% against a disclosed APR of 38.40% after ₹30,750 of deductions at source                                           | Tier-2 APR threshold (> 36% HIGH); cost-of-credit calculator input                                                      |
| 6.1      | Recovery agents at the borrower's cost; contact with employer and references                                                   | RBI Fair Practices Code on recovery agents                                                                              |

The arithmetic is internally consistent and is meant to be recomputed rather than
quoted: ₹5,00,000 over 36 months at 28% p.a. gives an EMI of ₹20,683 and a total
outflow of ₹7,44,588, against a net disbursal of ₹4,69,250.

### `nda-mutual-but-not.txt`

| Clause            | Planted issue                                                                                                                                          | Authority the rule should cite                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title vs 1.1, 2.1 | Called "Mutual", but "Confidential Information" is defined only as information disclosed **by Halcyon**, and every obligation binds only the Recipient | Tier-1 asymmetry — the flagship demo                                                                                                                                                                                           |
| 2.4               | Perpetual confidentiality on ordinary business information                                                                                             | Tier-2 threshold (perpetual on ordinary information is HIGH)                                                                                                                                                                   |
| 3.1               | Standard exclusions expressly negated — public domain, independent development, prior possession and compelled disclosure all excluded from relief     | The four ordinary NDA carve-outs, inverted; a clause purporting to bar compelled disclosure is unenforceable against a lawful order. Tier-4 "no exclusions list" here becomes an express negation, which is worse than absence |
| 4.1               | 5-year non-solicit of employees, contractors, customers and suppliers smuggled into an NDA                                                             | s.27 ICA; Tier-2 confidentiality/restraint duration                                                                                                                                                                            |
| 5.1               | Injunctive relief, without security or undertaking as to damages, available to one side only                                                           | ss.36–42 Specific Relief Act 1963; Tier-1 remedy asymmetry                                                                                                                                                                     |
| 5.2               | One-way indemnity including legal fees on a full indemnity basis                                                                                       | Tier-1 liability asymmetry                                                                                                                                                                                                     |
| 7.2               | Halcyon may amend the agreement by notice                                                                                                              | Tier-3 unilateral amendment                                                                                                                                                                                                    |

**Deliberately absent:** any term or expiry for the agreement itself, any permitted
disclosure to professional advisers, any obligation on Halcyon as a recipient, and any
reciprocal remedy.

### `freelance-msa.txt`

| Clause  | Planted issue                                                                                                                            | Authority the rule should cite                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1–2.2 | Unlimited revision rounds at no additional fee, until the Client is satisfied                                                            | Tier-3 "sole discretion attached to a payment obligation"                                                                                      |
| 4.1–4.2 | Payment 90 days after an invoice approval that is at the Client's sole discretion, so the clock may never start                          | MSMED Act 2006 ss.15–16 — 45 days maximum, 3× RBI bank rate compounded monthly; Tier-2 payment-terms threshold                                 |
| 5.1–5.2 | IP vests on the date of the Agreement, expressly not conditional on payment                                                              | Copyright Act 1957 s.19 — s.19(5) deems five years where no period is stated, s.19(6) India only, s.19(4) lapse if unexercised within one year |
| 5.3     | Waiver of moral rights plus a bar on portfolio use                                                                                       | s.57 Copyright Act 1957 — moral rights survive assignment                                                                                      |
| 7.1–7.2 | Indemnity unlimited in amount and unlimited in time, covering any allegation of infringement                                             | Tier-2 liability threshold (uncapped = HIGH)                                                                                                   |
| 8.1–8.2 | Termination for convenience with immediate effect and no payment for delivered but unapproved work, while the assignment at 5.1 survives | s.23 ICA; Tier-1 termination asymmetry                                                                                                         |
| 8.3     | The Consultant may terminate only on 90 days' notice after completing every SOW                                                          | Tier-1 termination asymmetry (immediate vs 90 days)                                                                                            |
| 6.1     | 12-month post-term restraint on serving the personal-care category                                                                       | s.27 ICA                                                                                                                                       |
| 12.2    | Client may amend its policies unilaterally and the Consultant must comply                                                                | Tier-3 unilateral amendment                                                                                                                    |

**Deliberately absent:** any late-payment interest or penalty clause, any cap on the
Consultant's liability, any kill fee, and any acceptance deadline after which a
deliverable is deemed accepted.

**Deliberate dangling cross-reference.** Clause 7.3 reads _"Nothing in this Clause 7
shall be read as subject to the limitation of liability at Clause 12.4."_ **Clause 12
has only 12.1, 12.2 and 12.3, and the Agreement contains no limitation of liability
anywhere.** This is planted, not a typo: it is the only broken cross-reference in this
directory, and a clause-numbering consistency test may rely on that. Every other file
resolves every `Clause N.N` reference it makes, and every section is numbered
contiguously from 1.

### `privacy-policy-shopapp.txt`

| Clause  | Planted issue                                                                                                                        | Authority the rule should cite                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1.1–1.2 | Unilateral amendment effective on posting, with no notice and continued use deemed acceptance                                        | CPA 2019 s.2(46)(iv)/(vi)                                                                                            |
| 10.1    | A support e-mail address only — **no grievance officer is named anywhere**                                                           | DPDP Act 2023 s.13 + DPDP Rules 2025 Rule 14; IT Rules 2021 (24-hour acknowledgement, 15-day resolution, GAC appeal) |
| 4.1–4.2 | Sharing with "affiliates and partners" who are never named and whose list changes                                                    | DPDP Act 2023 ss.5–7 notice and consent; purpose limitation                                                          |
| 5.1–5.2 | Retention "as long as necessary" plus "such further period as we consider appropriate"; deletion request met with archival retention | DPDP Act 2023 s.8(7) and Rule 8 (three-year inactivity erasure); Tier-2 retention threshold (indefinite = HIGH)      |
| 2.4     | Bundled permissions — background location, contacts, installed app list, SMS                                                         | DPDP Act 2023 s.6 (free, specific, informed, unconditional consent); data minimisation                               |
| 3.2     | Personalised pricing, offers and delivery charges from behavioural data                                                              | CCPA Dark Patterns Guidelines 2023                                                                                   |
| 3.3     | Promotional calls, SMS and WhatsApp, including for third parties, with opt-out only by writing in                                    | TRAI TCCCP Regulations 2018                                                                                          |
| 11.1    | Singapore-seated arbitration for an Indian consumer                                                                                  | _Emaar MGF_ (2018); CPA 2019 s.34(2)(d)                                                                              |
| 11.2    | Class-action waiver                                                                                                                  | CPA 2019 s.35(1)(c) permits complaints by one or more consumers on behalf of numerous consumers                      |
| 11.3    | 180-day claim bar                                                                                                                    | s.28(b) ICA; CPA 2019 s.69 allows two years                                                                          |
| 8.1     | "You use the Platform at your own risk" disclaiming security responsibility                                                          | IT Act 2000 s.43A; DPDP Act 2023 s.8(5) security safeguards                                                          |

**Honest caveat that must accompany any DPDP finding:** the DPDP Act gives no private
right to compensation. The realistic route is grievance officer, then the Data
Protection Board or the Grievance Appellate Committee, or a consumer complaint for
deficiency in service.

### `grocery-bill.txt`

Not an agreement. It contains a GSTIN, an FSSAI licence number, HSN codes, a CGST/SGST
split and a UPI reference, so it is realistic enough to be mistaken for a document
worth analysing — which is the point. The only contract-like text is a seven-day
returns line and a jurisdiction line at the foot, which is deliberate: the document
type classifier must still refuse it rather than latch onto those two sentences.

Its arithmetic is internally consistent, so a test can assert on it: taxable value
₹1,126.00 (₹190.00 exempt, ₹588.00 at 5%, ₹348.00 at 18%), CGST ₹46.02, SGST ₹46.02,
gross ₹1,218.04, rounded to **₹1,218.00**.

## Conventions used throughout

- Numbered clauses in `N` / `N.N` form, contiguous within each document.
- Every amount written twice — "Rupees Two Lakh (Rs. 2,00,000)" — and every duration
  written twice — "ninety (90) days".
- Indian 2-2-3 digit grouping (`12,00,000`, not `1,200,000`). Both `Rs.` and `₹`
  appear, because the amount parser has to handle both.
- Indian place names, CIN and GSTIN formats, and Indian statutory vocabulary
  (leave and licence, sanction letter, full and final settlement, relieving letter).
- Each file opens with the banner line
  `[SAMPLE — synthetic document written for demonstration. Not a real contract.]`
  so that a screenshot of any page of any sample is self-identifying.
- Each file is under 1,200 words, which keeps token cost and demo latency predictable.

| File                             | Words |
| -------------------------------- | ----- |
| `offer-letter-meridian.txt`      | 1,175 |
| `rent-agreement-koramangala.txt` | 1,049 |
| `personal-loan-sanction.txt`     | 898   |
| `freelance-msa.txt`              | 936   |
| `privacy-policy-shopapp.txt`     | 881   |
| `nda-mutual-but-not.txt`         | 469   |
| `grocery-bill.txt`               | 274   |
