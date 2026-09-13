import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import type { ClauseView } from '@/lib/clause-view';

export interface SourceDocumentProps {
  readonly text: string;
  readonly clauses: readonly ClauseView[];
  readonly dictionary: Dictionary;
}

interface Piece {
  readonly key: string;
  readonly text: string;
  readonly findingId: string | null;
}

/**
 * The document itself, with every cited span marked in place.
 *
 * This is the primary view of the source, not a PDF canvas with overlay highlights.
 * Extracted text works on a five-inch phone, costs a few kilobytes instead of a
 * rendering engine, is selectable, is searchable by find-in-page, and can be read
 * aloud by a screen reader — all of which a canvas gives up.
 *
 * The `[show in document]` link on each card lands here, on a `<mark>` that is
 * focusable so the browser moves the caret to it rather than merely scrolling past it.
 */
function split(text: string, clauses: readonly ClauseView[]): readonly Piece[] {
  const marks = clauses
    .map((clause) => ({
      id: clause.finding.id,
      start: clause.finding.location.start,
      end: clause.finding.location.end,
    }))
    .sort((left, right) => left.start - right.start);

  const pieces: Piece[] = [];
  let cursor = 0;

  for (const mark of marks) {
    // Two findings can legitimately cover overlapping ranges under different
    // categories. Only the first is marked; nesting a <mark> inside a <mark> would
    // produce an id the browser cannot scroll to reliably.
    if (mark.start < cursor) continue;
    if (mark.start > cursor) {
      pieces.push({
        key: `plain-${String(cursor)}`,
        text: text.slice(cursor, mark.start),
        findingId: null,
      });
    }
    pieces.push({ key: mark.id, text: text.slice(mark.start, mark.end), findingId: mark.id });
    cursor = mark.end;
  }

  if (cursor < text.length) {
    pieces.push({ key: `plain-${String(cursor)}`, text: text.slice(cursor), findingId: null });
  }

  return pieces;
}

export function SourceDocument({ text, clauses, dictionary }: SourceDocumentProps): JSX.Element {
  return (
    <section aria-labelledby="source-heading">
      <h2 id="source-heading" className="text-2xl">
        {dictionary.report.sourceHeading}
      </h2>
      <p className="text-muted mt-2 max-w-[68ch] text-sm">{dictionary.report.sourceLede}</p>

      <div className="border-rule bg-surface mt-4 overflow-x-auto border p-4 sm:p-5">
        <div className="font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
          {split(text, clauses).map((piece) =>
            piece.findingId === null ? (
              <span key={piece.key}>{piece.text}</span>
            ) : (
              <mark
                key={piece.key}
                id={`span-${piece.findingId}`}
                tabIndex={-1}
                className="scroll-mt-8"
              >
                {piece.text}
              </mark>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
