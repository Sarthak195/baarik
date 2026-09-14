import 'server-only';

import type { DocumentType } from '../../schemas/document-type';

/**
 * What each committed sample is called, and what it is worth opening for.
 *
 * The reports themselves are recorded output under `golden/reports/`; this is the only
 * thing about a sample that a human wrote. Keeping it separate means a re-recording
 * never touches the prose, and the prose never has to be reconciled with a diff of
 * machine output.
 *
 * `grocery-bill` is deliberately absent. It is a supermarket receipt whose recorded
 * outcome is a refusal, which makes it a valuable fixture and a pointless thing to
 * offer someone as a worked example.
 */
export interface SampleEntry {
  readonly id: string;
  readonly title: string;
  readonly documentType: DocumentType;
  /** One sentence on what this document is planted to demonstrate. */
  readonly blurb: string;
}

export const SAMPLE_CATALOGUE: readonly SampleEntry[] = [
  {
    id: 'offer-letter-meridian',
    title: 'Letter of Appointment — Software Engineer II',
    documentType: 'employment_offer',
    blurb:
      'A two-year non-compete that Indian law will not enforce, sitting beside a training bond that it will — but only up to the loss actually proved.',
  },
  {
    id: 'rent-agreement-koramangala',
    title: 'Leave and Licence Agreement — Koramangala',
    documentType: 'rent_agreement',
    blurb:
      'A deposit of ten months’ rent, a lock-in with total forfeiture, and no clause anywhere saying when the deposit comes back.',
  },
  {
    id: 'personal-loan-sanction',
    title: 'Personal Loan Sanction Letter',
    documentType: 'loan_agreement',
    blurb:
      'A foreclosure charge on a floating-rate personal loan, penal interest compounding monthly, and an arbitration clause that cannot keep you out of a consumer forum.',
  },
  {
    id: 'freelance-msa',
    title: 'Design Services Agreement',
    documentType: 'freelance_contract',
    blurb:
      'Payment ninety days after an approval with no deadline, copyright transferring on signature rather than on payment, and an indemnity with no ceiling.',
  },
  {
    id: 'nda-mutual-but-not',
    title: 'Mutual Non-Disclosure Agreement',
    documentType: 'nda',
    blurb:
      'Titled mutual; every obligation runs one way. Short enough to read on screen while the asymmetry meter explains itself.',
  },
  {
    id: 'privacy-policy-shopapp',
    title: 'Privacy Policy — ShopApp',
    documentType: 'privacy_policy',
    blurb:
      'Amendable without notice, retained for “as long as necessary”, and with no grievance officer named anywhere.',
  },
];

export function sampleEntry(id: string): SampleEntry | null {
  return SAMPLE_CATALOGUE.find((entry) => entry.id === id) ?? null;
}
