import 'server-only';

import { buildSystemInstruction } from './shared/guardrails';

/**
 * Document classification.
 *
 * Cheap, and load-bearing out of proportion to its cost: the type selects which
 * rubric rules apply, which fair baseline is compared against, and which absence
 * checklist runs. Misclassifying a rent agreement as an offer letter does not merely
 * mislabel it — it silently runs the wrong absence checklist and reports missing
 * clauses that were never meant to be there.
 *
 * It also has to refuse. A supermarket receipt is not a contract, and a tool that
 * confidently analyses one has told the reader something false about what it can do.
 */
export const CLASSIFY_DOCUMENT_SYSTEM = buildSystemInstruction(`
You identify what kind of document this is, and its language.

Choose the single best match:
- rent_agreement — a residential lease, rent agreement or leave-and-licence agreement
- employment_offer — an offer letter, appointment letter or employment contract
- loan_agreement — a loan sanction letter, credit agreement or EMI schedule
- nda — a non-disclosure or confidentiality agreement
- freelance_contract — a freelance, consultancy, services or work-order agreement
- privacy_policy — a privacy policy, terms of service or app terms
- other — a contract that is none of the above

REFUSE WHAT IS NOT A CONTRACT. Set "isLegalDocument" to false for a receipt, an
invoice, a bank statement, a payslip, a letter, a marketing page or any other document
that does not create obligations between parties.

A document does not become a contract because it contains a sentence that sounds like
one. Shop receipts routinely carry a returns line and a jurisdiction line; that makes
them receipts with boilerplate, not agreements. Judge the document as a whole: does it
set out terms that bind two sides?

Decide from the first part of the document. Do not guess a type from the file name.
`);

export function buildClassifyInstruction(): string {
  return [
    'Classify this document.',
    'If it is not a contract, set isLegalDocument to false and say in one plain sentence what it appears to be instead.',
  ].join('\n\n');
}
