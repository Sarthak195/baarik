import { pageNumberAt, segmentIdAt } from '../document/normalise';
import type { CanonicalDocument, Span } from '../document/types';
import type { ConsistencySite } from './types';

/**
 * Attach the coordinates a reader navigates by — clause label and page — to a raw
 * character range.
 *
 * A finding reported as "offset 4812" is unusable; the same finding reported as
 * "clause 7.2 on page 3, reading '…'" can be checked against the paper in front of
 * the user, which is the only way they can disagree with us.
 */
export function siteAt(document: CanonicalDocument, span: Span): ConsistencySite {
  const segmentId = segmentIdAt(document, span.start);
  const segment =
    segmentId === null ? undefined : document.segments.find((entry) => entry.id === segmentId);

  return {
    start: span.start,
    end: span.end,
    quote: document.text.slice(span.start, span.end),
    segmentId,
    segmentLabel: segment?.label ?? null,
    pageNumber: pageNumberAt(document, span.start),
  };
}

/** How a site is named in prose: "clause 7.2", or "page 3", or nothing useful. */
export function describeSite(site: ConsistencySite): string {
  if (site.segmentLabel !== null) return `clause ${site.segmentLabel}`;
  if (site.pageNumber !== null) return `page ${String(site.pageNumber)}`;
  return 'elsewhere in the document';
}
