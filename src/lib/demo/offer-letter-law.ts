import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import { locate } from './ground';
import { OFFER_LETTER_TEXT as TEXT } from './offer-letter-text';

/**
 * Four statute rows, transcribed from `data/enforceability/*.yaml`.
 *
 * They are copied rather than imported because reading a YAML file is I/O, and the
 * loader that does it lives in the server layer this commit does not touch. When the
 * pipeline lands, the report page receives these rows from `loadEnforceabilityTable`
 * and this file is deleted — the shape is already identical, which is the point.
 *
 * Every row states what the section provides and what courts have held, and carries
 * the caveats that say what it does not decide. ADR 0005: no bare verdicts.
 */

export const NON_COMPETE: EnforceabilityVerdict = {
  construct: 'post_employment_non_compete',
  verdict: 'likely_void',
  confidence: 'high',
  statute: {
    act: 'Indian Contract Act, 1872',
    section: 'Section 27 — Agreement in restraint of trade, void',
    text: 'Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.',
    url: 'https://www.indiacode.nic.in/show-data?actid=AC_CEN_3_20_00035_187209_1523268996428&sectionId=38631&sectionno=27&orderno=28',
  },
  authorities: [
    {
      cite: 'Niranjan Shankar Golikari v The Century Spinning and Mfg Co Ltd, AIR 1967 SC 1098 (17 January 1967)',
      holding:
        'A restraint operating while the employment is still running was upheld; the Supreme Court treated restrictions that bite after the employment ends as standing on a different footing under section 27.',
      url: 'https://indiankanoon.org/doc/452434/',
    },
    {
      cite: 'Varun Tyagi v Daffodil Software Private Limited, FAO 167/2025, Delhi High Court (25 June 2025)',
      holding:
        'A clause barring the employee from working with a business associate of the employer after the employment ended was held void under section 27; confidentiality and trade-secret protection was treated as the legitimate route instead.',
      url: 'https://indiankanoon.org/doc/187332526/',
    },
  ],
  plainMeaning:
    'Indian law generally does not enforce a promise not to work for a competitor after your job ends. India has no test of reasonableness that saves such a promise, unlike England or the United States. The confidentiality promise sitting next to it is a separate thing and usually does still hold.',
  caveats: [
    'This describes what the section says and how courts have read it. It is not an opinion about your contract or your situation.',
    'A restraint that applies while you are still employed is treated differently and is often enforced.',
    'The other side can still sue. Only a court can decide what this clause does on your facts, and defending a suit costs time and money.',
  ],
  appliesTo: ['employment_offer', 'nda', 'freelance_contract'],
  evidence: locate(
    TEXT,
    'you shall not directly or indirectly join, be employed by, advise, consult for, or hold any interest in any competing business in the territory of India',
  ),
};

export const SERVICE_BOND: EnforceabilityVerdict = {
  construct: 'forfeiture_of_paid_amounts',
  verdict: 'capped_by_statute',
  confidence: 'high',
  statute: {
    act: 'Indian Contract Act, 1872',
    section: 'Section 74 — Compensation for breach of contract where penalty stipulated for',
    text: 'When a contract has been broken, if a sum is named in the contract as the amount to be paid in case of such breach, or if the contract contains any other stipulation by way of penalty, the party complaining of the breach is entitled, whether or not actual damage or loss is proved to have been caused thereby, to receive from the party who has broken the contract reasonable compensation not exceeding the amount so named or, as the case may be, the penalty stipulated for.',
    url: 'https://www.indiacode.nic.in/show-data?actid=AC_CEN_3_20_00035_187209_1523268996428&orderno=75',
  },
  authorities: [
    {
      cite: 'Kailash Nath Associates v Delhi Development Authority, (2015) 4 SCC 136 (9 January 2015)',
      holding:
        'Section 74 awards reasonable compensation for loss caused by the breach; damage or loss is a sine qua non, and where no loss is shown the named sum is not recoverable merely because it was named.',
      url: 'https://indiankanoon.org/doc/70828540/',
    },
    {
      cite: 'Vijaya Bank v Prashant B Narnaware, 2025 INSC 691 (14 May 2025)',
      holding:
        'A minimum-service clause requiring Rs 2,00,000 on premature resignation was upheld: it was treated as a genuine pre-estimate of the recruitment and training cost rather than a penalty, and as not being a restraint of trade.',
      url: 'https://indiankanoon.org/doc/42763766/',
    },
  ],
  plainMeaning:
    'A sum named in the contract sets the ceiling, not the amount. The other side can recover what it can show it actually lost, up to that figure, and a court decides what is reasonable.',
  caveats: [
    'This states the rule in the section. What the other side can actually recover from you depends on evidence a court has not yet seen.',
    'Where the named sum is a genuine pre-estimate of a real cost and is reasonable, courts have allowed the whole of it, as in Vijaya Bank (2025).',
    'Recovering the sum out of your full and final settlement raises a separate question under the Code on Wages, 2019, which this row does not decide.',
  ],
  appliesTo: [],
  evidence: locate(
    TEXT,
    'The said sum shall be payable in full irrespective of the service actually completed',
  ),
};

export const SHORT_LIMITATION: EnforceabilityVerdict = {
  construct: 'contractual_limitation_period',
  verdict: 'likely_void',
  confidence: 'high',
  statute: {
    act: 'Indian Contract Act, 1872',
    section:
      'Section 28(b), read with section 28(a) — Agreements in restraint of legal proceedings, void',
    text: 'Every agreement, (a) by which any party thereto is restricted absolutely from enforcing his rights under or in respect of any contract, by the usual legal proceedings in the ordinary tribunals, or which limits the time within which he may thus enforce his rights; or (b) which extinguishes the rights of any party thereto, or discharges any party thereto from any liability, under or in respect of any contract on the expiry of a specified period so as to restrict any party from enforcing his rights, is void to that extent.',
    url: 'https://www.indiacode.nic.in/show-data?actid=AC_CEN_3_20_00035_187209_1523268996428&sectionId=38632&sectionno=28&orderno=29',
  },
  authorities: [],
  plainMeaning:
    'A clause that gives you only six months to raise a claim, or that says your rights disappear after a short period, does not usually take away the time the general law of limitation gives you.',
  caveats: [
    'This describes the section, not your contract. Whether a particular clause falls inside it is for a court to decide.',
    'The section does not extend the time the Limitation Act gives you. That clock runs from when your cause of action arose, whatever the contract says.',
    'Arbitration clauses that set a period for commencing arbitration are treated separately and are not all caught by this section.',
  ],
  appliesTo: [],
  evidence: locate(TEXT, 'every right in respect of such claim shall stand extinguished'),
};

export const SOLE_ARBITRATOR: EnforceabilityVerdict = {
  construct: 'unilateral_arbitrator_appointment',
  verdict: 'likely_unenforceable_as_written',
  confidence: 'high',
  statute: {
    act: 'Arbitration and Conciliation Act, 1996',
    section: 'Section 12(5), read with the Seventh Schedule',
    text: 'Notwithstanding any prior agreement to the contrary, any person whose relationship, with the parties or counsel or the subject-matter of the dispute, falls under any of the categories specified in the Seventh Schedule shall be ineligible to be appointed as an arbitrator: Provided that parties may, subsequent to disputes having arisen between them, waive the applicability of this sub-section by an express agreement in writing.',
    url: 'https://www.indiacode.nic.in/show-data?actid=AC_CEN_3_46_00004_199626_1517807323919&sectionId=24513&sectionno=12&orderno=13',
  },
  authorities: [
    {
      cite: 'Perkins Eastman Architects DPC v HSCC (India) Ltd, Arbitration Application No. 32 of 2019, Supreme Court (26 November 2019)',
      holding:
        "A person who has an interest in the outcome of the dispute must not have the power to appoint a sole arbitrator; where the clause gave one party's managing director that power, the Court appointed an independent arbitrator instead.",
      url: 'https://indiankanoon.org/doc/155925871/',
    },
  ],
  plainMeaning:
    'When only one side gets to choose the arbitrator, courts have held that the person chosen cannot decide the dispute. The agreement to arbitrate usually survives; it is the one-sided appointment that does not.',
  caveats: [
    'This states what the section and the Supreme Court have held. It is not an opinion on the clause in your document.',
    'The parties can waive this by an express written agreement made after a dispute has arisen, so signing anything at that stage deserves care.',
    'Setting an appointment aside is done by applying to a court, usually under section 11; the clause does not simply stop working on its own.',
  ],
  appliesTo: [],
  evidence: locate(
    TEXT,
    'before a sole arbitrator appointed by the Managing Director of the Company',
  ),
};
