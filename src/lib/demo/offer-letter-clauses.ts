import type { ClauseView } from '@/lib/clause-view';
import { OFFER_LETTER_RESTRAINTS } from './offer-letter-restraints';
import { OFFER_LETTER_TERMS } from './offer-letter-terms';

/**
 * Seven clauses, in the order they appear in the document.
 *
 * Reading order rather than severity order is deliberate. A reader checking the report
 * against the paper in front of them is moving down the page, and a report that
 * reorders their document makes them lose their place. The severest clauses are
 * surfaced separately, at the top, as the risk summary's top drivers.
 */
export const OFFER_LETTER_CLAUSES: readonly ClauseView[] = [
  ...OFFER_LETTER_TERMS,
  ...OFFER_LETTER_RESTRAINTS,
];
