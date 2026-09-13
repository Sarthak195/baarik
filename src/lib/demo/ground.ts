import type { GroundingMethod, QuoteLocation } from '@/core/grounding/types';
import type { GroundedFinding } from '@/core/grounding/verify';
import type { RawFinding } from '@/schemas/finding';

/**
 * Demonstration data, grounded the same way real data is.
 *
 * The analysis pipeline is wired up in a separate commit, so the report pages render
 * from fixtures. Those fixtures could have carried invented character offsets, and
 * nobody looking at the screen would know. They do not: every location below is
 * computed by searching the demo document for the quote, exactly as
 * `src/core/grounding/locate.ts` does for a real one.
 *
 * That has a useful consequence. A quote that is not in the document throws at module
 * load, which fails the build rather than shipping a highlight that points at the
 * wrong sentence — the same failure mode the real verifier is built to produce.
 */

export function locate(
  text: string,
  quote: string,
  method: GroundingMethod = 'exact',
  similarity = 1,
): QuoteLocation {
  const start = text.indexOf(quote);
  if (start < 0) {
    throw new Error(`Demo quote is not present in the demo document: "${quote.slice(0, 48)}…"`);
  }
  return { start, end: start + quote.length, method, similarity, matchedText: quote };
}

/**
 * Segment ids mirror the clause numbering the document itself prints, because a
 * citation the reader cannot find on the page is not a citation.
 */
export function groundFinding(
  text: string,
  finding: RawFinding,
  pageNumber: number,
): GroundedFinding {
  return {
    ...finding,
    location: locate(text, finding.exactQuote),
    segmentId: finding.clauseLabel === null ? null : `clause-${finding.clauseLabel}`,
    pageNumber,
  };
}
