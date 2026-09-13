import 'server-only';

import type { DocumentType } from '../../schemas/document-type';
import { buildSystemInstruction } from './shared/guardrails';

/**
 * Fact extraction — the input to the deterministic risk engine.
 *
 * This is the highest-stakes prompt in the application. Everything the rubric reasons
 * about arrives through it, so a misread number becomes a wrong risk score rather
 * than a wrong sentence. The instruction is written accordingly: accuracy of the
 * figures matters more than completeness, because a null produces an honest "we could
 * not determine this" while a wrong number produces a confident falsehood.
 */
export const EXTRACT_FACTS_SYSTEM = buildSystemInstruction(`
You extract structured facts from a contract. The facts feed a calculator that applies
fixed thresholds, so precision matters more than coverage.

UNITS — these are not negotiable, because a threshold like "lock-in longer than six
months" is meaningless if the field might be in days:
- Notice, cure and refund periods: DAYS.
- Lock-in, term, bond, confidentiality and non-compete durations: MONTHS.
- All money: RUPEES, as a plain number. Convert before you answer.
  "Rs. 2,00,000" is 200000. "1.5 lakh" is 150000. "2 Cr" is 20000000.
  Indian digit grouping is 2-2-3 from the right: "1,50,000" is 150000, not 150.
- Percentages: the number only. "3% per month" is 3 for a monthly field; convert an
  explicitly monthly rate to annual only when the field name says annual.

WHERE A FIGURE APPEARS TWICE, in words and in digits, and the two disagree, report the
figure in WORDS and cite both. Indian drafting writes numbers twice precisely so the
words govern.

PRESENCE — every construct takes one of three answers, and the difference between the
last two is the whole reason this field exists:
- "present": the clause is in the document. Quote it.
- "absent": you read the entire document and there is no clause on this point.
- "unclear": the document says something related but you cannot tell.
Never answer "absent" because you did not look, and never because the clause would be
unusual. A missing protection is reported to the reader as a finding, so an
unjustified "absent" accuses a contract of something it does not say.

CITATIONS: for every numeric field you fill in, add an entry to "citations" naming the
field and quoting the text you read it from, copied exactly.
`);

/**
 * The varying half of the request. Sent AFTER the document so the document stays a
 * stable prefix and Gemini's implicit context caching can hit across turns.
 */
export function buildExtractFactsInstruction(documentType: DocumentType): string {
  return [
    `This document has been classified as: ${describeType(documentType)}.`,
    'Extract the facts defined by the response schema.',
    'Leave a field null when the document does not state it. A null is a correct answer.',
    typeHint(documentType),
  ]
    .filter((line) => line.length > 0)
    .join('\n\n');
}

function describeType(documentType: DocumentType): string {
  switch (documentType) {
    case 'rent_agreement':
      return 'a residential rent or leave-and-licence agreement';
    case 'employment_offer':
      return 'an employment offer or appointment letter';
    case 'loan_agreement':
      return 'a loan sanction letter or credit agreement';
    case 'nda':
      return 'a non-disclosure or confidentiality agreement';
    case 'freelance_contract':
      return 'a freelance, consultancy or services agreement';
    case 'privacy_policy':
      return 'a privacy policy or terms of service';
    case 'other':
      return 'a contract of a type this system does not model specifically';
  }
}

/**
 * Per-type hints about the fields most often misread.
 *
 * Each line exists because the mistake it prevents is one a careful reader also makes:
 * conflating a deposit with advance rent, or a bond with a notice buy-out.
 */
function typeHint(documentType: DocumentType): string {
  switch (documentType) {
    case 'rent_agreement':
      return [
        'Watch for: a security deposit stated separately from advance rent — they are',
        'different figures. Lock-in is the period during which the tenant may not leave,',
        'which is not the same as the agreement term. Escalation is per year unless the',
        'document says otherwise.',
      ].join(' ');
    case 'employment_offer':
      return [
        'Watch for: a training bond and a notice-period buy-out are different obligations',
        'even when both are stated in rupees. CTC is annual unless stated otherwise. Notice',
        'is often asymmetric — read the employee and employer figures separately, and do not',
        'assume the second equals the first.',
      ].join(' ');
    case 'loan_agreement':
      return [
        'Watch for: the headline interest rate and the effective APR are usually different',
        'numbers, and the APR is the one the schema asks for when it is disclosed. Penal',
        'charges are commonly stated per month; the field asks per month.',
      ].join(' ');
    case 'freelance_contract':
      return [
        'Watch for: payment terms may run from invoice date or from an approval step. If',
        'approval is required and has no deadline, the payment term is not determinable —',
        'report it as null rather than reading the number beside it.',
      ].join(' ');
    case 'nda':
      return [
        'Watch for: an obligation that binds only one party even where the agreement is',
        'titled mutual. Report the duration of the confidentiality obligation, and use a',
        'very large number of months only if the document truly says perpetual.',
      ].join(' ');
    case 'privacy_policy':
      return [
        'Watch for: a retention period stated as a purpose rather than a duration ("as long',
        'as necessary") is not a period. Report the retention field as null and mark the',
        'retention-limit construct absent.',
      ].join(' ');
    case 'other':
      return '';
  }
}
