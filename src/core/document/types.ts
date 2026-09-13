/**
 * The canonical document is the single source of truth for every character offset
 * in the system. A citation is only meaningful relative to one specific string, so
 * exactly one string is blessed: `CanonicalDocument.text`.
 *
 * Everything that produces text — a PDF extractor, a DOCX converter, a paste box —
 * funnels through `toCanonicalDocument` and is never consulted again.
 */

/** A contiguous half-open character range `[start, end)` in `CanonicalDocument.text`. */
export interface Span {
  readonly start: number;
  /** Exclusive. `text.slice(start, end)` yields the covered characters. */
  readonly end: number;
}

/** Where a page of the source document begins in the canonical text. */
export interface PageMark {
  /** 1-indexed, matching what a reader sees printed on the page. */
  readonly pageNumber: number;
  readonly span: Span;
}

/**
 * A numbered or headed region of the document — "7.2", "Schedule A", "WHEREAS".
 * Segments let a finding be reported as "clause 7.2 on page 4" rather than as a
 * bare character offset, which is what a user can actually act on.
 */
export interface Segment {
  readonly id: string;
  /** The clause number exactly as printed, e.g. "7.2". Null when unnumbered. */
  readonly label: string | null;
  readonly span: Span;
}

export interface CanonicalDocument {
  /** The blessed string. All offsets everywhere index into this and nothing else. */
  readonly text: string;
  readonly pages: readonly PageMark[];
  readonly segments: readonly Segment[];
  /** SHA-256 of `text`, used as the cache key. Computed in the server layer. */
  readonly hash: string;
  /**
   * True when the source exceeded `LIMITS.maxCanonicalChars` and was cut short.
   * Surfaced to the user; a silently half-analysed contract that reports low risk
   * is the worst failure this product can produce.
   */
  readonly truncated: boolean;
}

/** Raw output of an extractor, before canonicalisation. */
export interface RawExtraction {
  readonly text: string;
  readonly pageTexts: readonly string[];
  readonly source: 'pdf' | 'docx' | 'text' | 'vision';
  /**
   * True when text came from the model reading page images rather than from
   * embedded text. Character offsets are not trustworthy in that case, so
   * citations are reported at page granularity instead.
   */
  readonly offsetsReliable: boolean;
}
