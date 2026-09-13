import type { CanonicalDocument, PageMark, RawExtraction, Segment } from './types';

/**
 * Construction of the canonical document.
 *
 * Extractors disagree about whitespace: a PDF text layer emits hard line breaks
 * mid-sentence and hyphenates across them, a DOCX converter emits none, a paste box
 * emits whatever the user's clipboard held. Canonicalisation reconciles those into
 * one string that is stable enough to index into and still readable enough to show
 * a user, because the same string does both jobs.
 *
 * What canonicalisation deliberately does NOT do is fold case, quotes or spacing.
 * That is `foldForMatching`'s job and it happens only inside the grounding verifier.
 * Keeping the two separate is what lets a citation highlight land on the real text a
 * reader sees rather than on a lower-cased approximation of it.
 */

export interface CanonicaliseOptions {
  /** Hard cap on canonical length. Exceeding it sets `truncated`, never silently cuts. */
  readonly maxChars: number;
}

export const CANONICALISE_DEFAULTS: CanonicaliseOptions = { maxChars: 400_000 };

/** Zero-width characters that survive PDF extraction and corrupt offset arithmetic. */
const INVISIBLE_GLOBAL = /[­​‌‍⁠﻿]/g;

/**
 * A word broken across a line by a typesetter: "reimburse-\nment" is one word.
 * Requires a lowercase letter on both sides so that a genuine compound at a line
 * end ("twenty-four\nmonths") and a numbered list ("7 -\n(a)") are left alone.
 */
const LINE_BREAK_HYPHENATION = /([a-z])-\n([a-z])/g;

/**
 * A clause label at the start of a line: "7.", "7.1", "11.3.2", "(a)", "Clause 9",
 * "Schedule A", "ANNEXURE II". Anchored to line starts because a bare "7.1" inside a
 * sentence is a cross-reference, not a heading.
 */
const SEGMENT_LABEL =
  /^[ \t]*(?:(?:clause|section|article|schedule|annexure|appendix)\s+)?((?:\d+(?:\.\d+)*)|(?:\([a-z]{1,3}\))|(?:[IVXLC]+\.))(?=[).\s])/gim;

/**
 * Build the canonical document.
 *
 * @param hash SHA-256 of the extraction, computed by the caller. Hashing needs a
 *   crypto implementation, which is I/O-adjacent and therefore not permitted in
 *   `src/core`; the server computes it and passes it in so this function stays pure.
 */
export function toCanonicalDocument(
  raw: RawExtraction,
  hash: string,
  options: CanonicaliseOptions = CANONICALISE_DEFAULTS,
): CanonicalDocument {
  const normalised = normaliseText(raw.text);
  const truncated = normalised.length > options.maxChars;
  const text = truncated ? normalised.slice(0, options.maxChars) : normalised;

  return {
    text,
    pages: buildPageMarks(raw.pageTexts, text),
    segments: findSegments(text),
    hash,
    truncated,
  };
}

/**
 * Reconcile extractor whitespace quirks without disturbing paragraph structure.
 *
 * Blank lines are preserved (collapsed to at most one) because they are the only
 * reliable clause boundary signal in an unstructured text layer.
 */
export function normaliseText(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_GLOBAL, '')
    .replace(LINE_BREAK_HYPHENATION, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Map each source page onto a range of the canonical text.
 *
 * Pages are located by searching for a distinctive prefix of each page's own text
 * rather than by accumulating lengths, because normalisation changes lengths
 * unpredictably. A page whose prefix cannot be found is skipped rather than
 * guessed at: a wrong page number on a citation is worse than none.
 */
function buildPageMarks(pageTexts: readonly string[], text: string): readonly PageMark[] {
  const marks: PageMark[] = [];
  let searchFrom = 0;

  for (const [index, pageText] of pageTexts.entries()) {
    const probe = normaliseText(pageText).slice(0, 40);
    if (probe.length < 8) continue;

    const start = text.indexOf(probe, searchFrom);
    if (start === -1) continue;

    // Close the previous page at this one's start; the last page runs to the end.
    const previous = marks[marks.length - 1];
    if (previous) {
      marks[marks.length - 1] = {
        pageNumber: previous.pageNumber,
        span: { start: previous.span.start, end: start },
      };
    }

    marks.push({ pageNumber: index + 1, span: { start, end: text.length } });
    searchFrom = start + probe.length;
  }

  return marks;
}

/**
 * Locate numbered or headed regions so a finding can be reported as "clause 7.2"
 * rather than as a character offset a user cannot act on.
 *
 * Each segment runs from its own label to the start of the next, so the segments
 * tile the document and a lookup by offset is a simple containment test.
 */
export function findSegments(text: string): readonly Segment[] {
  const starts: { label: string; start: number }[] = [];

  SEGMENT_LABEL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SEGMENT_LABEL.exec(text)) !== null) {
    const label = match[1];
    if (label !== undefined) starts.push({ label, start: match.index });
  }

  return starts.map((entry, index) => ({
    id: `seg-${String(index + 1)}-${entry.label.replace(/[^\w.]/g, '')}`,
    label: entry.label,
    span: { start: entry.start, end: starts[index + 1]?.start ?? text.length },
  }));
}

/** The id of the segment containing `offset`, or null when the offset precedes all of them. */
export function segmentIdAt(document: CanonicalDocument, offset: number): string | null {
  for (const segment of document.segments) {
    if (offset >= segment.span.start && offset < segment.span.end) return segment.id;
  }
  return null;
}

/** The 1-indexed page containing `offset`, or null when page marks are unavailable. */
export function pageNumberAt(document: CanonicalDocument, offset: number): number | null {
  for (const page of document.pages) {
    if (offset >= page.span.start && offset < page.span.end) return page.pageNumber;
  }
  return null;
}
