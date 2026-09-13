import type { CanonicalDocument } from '../document/types';
import { parseRupees } from '../finance/rupees';
import { parseNumberWords, trailingFigure, trailingNumberWords } from './number-words';
import { describeSite, siteAt } from './site';
import type { Inconsistency } from './types';

/**
 * Words against figures: "thirty (60) days".
 *
 * Indian drafting states the important numbers twice, which turns the document into
 * its own checksum. No interpretation is involved in reading the check: the contract
 * asserts a quantity, asserts it again in another notation, and the two assertions
 * either agree or they do not. When they do not, neither the drafter nor the reader
 * knows which one binds — and in a dispute the courts will have to decide, which is
 * precisely the situation a reader is trying to avoid by reading it beforehand.
 */

/** Parentheticals only; the redundant notation is always bracketed in this convention. */
const PARENTHETICAL = /\(([^()\n]{1,40})\)/g;

/** How far back to look for the other notation. Long enough for "Rupees Two Lakh Fifty Thousand". */
const LOOKBACK = 70;

/**
 * Everything a bracketed figure is allowed to contain besides the number itself.
 * Anything else — "(2 pages)", "(as per Annexure 3)" — is not a restatement of a
 * quantity and must not be compared against the words in front of it.
 */
const FIGURE_RESIDUE =
  /₹|\brs\.?|\binr\b|\brupees?\b|\bonly\b|\blakhs?\b|\blacs?\b|\bcrores?\b|\bthousand\b|\bmillion\b|per\s*cent|percent|\/-|%|[\d,.\s-]/gi;

export function findFigureWordMismatches(document: CanonicalDocument): readonly Inconsistency[] {
  const findings: Inconsistency[] = [];
  const text = document.text;

  PARENTHETICAL.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PARENTHETICAL.exec(text)) !== null) {
    const inner = match[1];
    if (inner === undefined) continue;

    const open = match.index;
    const close = match.index + match[0].length;
    const windowStart = Math.max(0, open - LOOKBACK);
    const before = text.slice(windowStart, open);

    const comparison = /\d/.test(inner)
      ? compareFigureInBrackets(inner, before, windowStart)
      : compareWordsInBrackets(inner, before, windowStart);
    if (comparison === null) continue;

    const at = siteAt(document, { start: comparison.start, end: close });
    findings.push({
      kind: 'figure_word_mismatch',
      severity: 'high',
      title: `Words and figures disagree: ${at.quote.trim()}`,
      detail: `${describeSite(at)} states the same quantity twice and the two do not match — ${formatValue(comparison.words)} in words against ${formatValue(comparison.figure)} in figures. Which one binds is not something this document settles.`,
      at,
      counterpart: null,
    });
  }

  return findings;
}

interface Comparison {
  readonly start: number;
  readonly words: number;
  readonly figure: number;
}

/** The common form: "ninety (90) days", "Rupees Two Lakh (Rs. 2,00,000)". */
function compareFigureInBrackets(
  inner: string,
  before: string,
  windowStart: number,
): Comparison | null {
  const figure = figureValue(inner);
  if (figure === null) return null;

  const words = trailingNumberWords(before);
  if (words === null || words.value === figure) return null;

  return { start: windowStart + words.start, words: words.value, figure };
}

/** The inverted form: "90 (ninety) days". */
function compareWordsInBrackets(
  inner: string,
  before: string,
  windowStart: number,
): Comparison | null {
  const words = parseNumberWords(inner);
  if (words === null) return null;

  const figure = trailingFigure(before);
  if (figure === null || figure.value === words) return null;

  return { start: windowStart + figure.start, words, figure: figure.value };
}

/**
 * The number a bracketed figure states, or null when the brackets hold something
 * that is not purely a quantity. `parseRupees` does the reading because the Indian
 * digit grouping ("2,00,000") and the lakh/crore multipliers are exactly where a
 * naive parse silently produces the wrong number.
 */
function figureValue(inner: string): number | null {
  if (inner.replace(FIGURE_RESIDUE, '').trim() !== '') return null;
  return parseRupees(inner);
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
