import type { RawFinding } from '../../schemas/finding';
import { foldForMatching } from '../document/fold';
import { pageNumberAt, segmentIdAt } from '../document/normalise';
import type { CanonicalDocument } from '../document/types';
import { locateQuote } from './locate';
import {
  LOCATE_DEFAULTS,
  type GroundingMethod,
  type LocateOptions,
  type QuoteLocation,
  type UngroundedReason,
} from './types';

/**
 * The verification pass.
 *
 * `locateQuote` decides whether one quote is real; this decides what happens to a
 * whole set of them. Two responsibilities beyond locating: de-duplication, because
 * models routinely report the same clause twice under two categories, and statistics,
 * because the rejection rate is information the user is entitled to see.
 */

/** A finding whose quote was located in the document. Safe to render as a citation. */
export interface GroundedFinding extends RawFinding {
  readonly location: QuoteLocation;
  readonly segmentId: string | null;
  readonly pageNumber: number | null;
}

/** A finding that failed verification, retained so the failure can be shown rather than hidden. */
export interface RejectedFinding {
  readonly finding: RawFinding;
  readonly reason: UngroundedReason;
}

export interface GroundingStats {
  readonly total: number;
  readonly grounded: number;
  readonly exact: number;
  readonly normalised: number;
  readonly fuzzy: number;
  readonly rejected: number;
  readonly rejectionsByReason: Readonly<Record<UngroundedReason, number>>;
}

export interface VerificationReport {
  readonly grounded: readonly GroundedFinding[];
  readonly rejected: readonly RejectedFinding[];
  readonly stats: GroundingStats;
}

const EMPTY_REASON_COUNTS: Readonly<Record<UngroundedReason, number>> = {
  quote_empty: 0,
  quote_too_short: 0,
  not_found: 0,
  below_threshold: 0,
  ambiguous: 0,
  duplicate: 0,
};

/**
 * Verify every finding against the document.
 *
 * Nothing that fails is allowed through. The statistics are surfaced to the user as
 * "17 of 18 findings were matched to text in your document; 1 was discarded because
 * we could not find it" — which turns an internal safety mechanism into visible
 * evidence of care, and makes suppression by a hostile document detectable.
 *
 * The document is folded once here and the index reused for every quote, so the pass
 * is O(document + quotes x window) rather than O(quotes x document).
 */
export function verifyFindings(
  document: CanonicalDocument,
  findings: readonly RawFinding[],
  options: LocateOptions = LOCATE_DEFAULTS,
): VerificationReport {
  const index = foldForMatching(document.text);
  const grounded: GroundedFinding[] = [];
  const rejected: RejectedFinding[] = [];
  const claimed = new Set<string>();

  for (const finding of findings) {
    const outcome = locateQuote(document.text, finding.exactQuote, options, index);

    if (outcome.status === 'unverified') {
      rejected.push({ finding, reason: outcome.reason });
      continue;
    }

    // Two findings covering the same span under the same category are the same
    // finding. Different categories over one span are kept: a clause can genuinely
    // be both a penalty and a restraint of trade.
    const key = `${String(outcome.location.start)}:${String(outcome.location.end)}:${finding.category}`;
    if (claimed.has(key)) {
      rejected.push({ finding, reason: 'duplicate' });
      continue;
    }
    claimed.add(key);

    grounded.push({
      ...finding,
      location: outcome.location,
      segmentId: segmentIdAt(document, outcome.location.start),
      pageNumber: pageNumberAt(document, outcome.location.start),
    });
  }

  return { grounded, rejected, stats: summarise(grounded, rejected) };
}

function summarise(
  grounded: readonly GroundedFinding[],
  rejected: readonly RejectedFinding[],
): GroundingStats {
  const byMethod = (method: GroundingMethod): number =>
    grounded.filter((finding) => finding.location.method === method).length;

  const rejectionsByReason = { ...EMPTY_REASON_COUNTS };
  for (const entry of rejected) {
    rejectionsByReason[entry.reason] += 1;
  }

  return {
    total: grounded.length + rejected.length,
    grounded: grounded.length,
    exact: byMethod('exact'),
    normalised: byMethod('normalised'),
    fuzzy: byMethod('fuzzy'),
    rejected: rejected.length,
    rejectionsByReason,
  };
}
