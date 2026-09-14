import { foldForMatching, type FoldedText } from '../document/fold';
import { diceCoefficient } from './similarity';
import {
  LOCATE_DEFAULTS,
  type GroundingMethod,
  type GroundingOutcome,
  type LocateOptions,
  type QuoteLocation,
} from './types';

/**
 * Resolve a model-supplied verbatim quote to a character range in the document.
 *
 * This is the hallucination gate. A language model asserts that `quote` appears in
 * the document; this function checks that assertion and lets nothing through that
 * fails. It never invents a range — a quote that cannot be found is reported as
 * `unverified` with a reason, and the caller decides whether to drop or flag it.
 *
 * Three strategies are tried in decreasing order of confidence; the first that
 * succeeds wins.
 *
 * @param index Optional pre-folded document, shared across every quote in one
 *   verification pass. Without it, folding is repeated per quote and the pass
 *   becomes O(quotes x document) instead of O(document).
 */
export function locateQuote(
  document: string,
  quote: string,
  options: LocateOptions = LOCATE_DEFAULTS,
  index?: FoldedText,
): GroundingOutcome {
  const trimmed = quote.trim();
  if (trimmed.length === 0) return { status: 'unverified', reason: 'quote_empty' };
  if (trimmed.length < options.minQuoteLength) {
    return { status: 'unverified', reason: 'quote_too_short' };
  }

  // 1. Exact. Tried first because it is free, not because it usually wins: across the
  // committed corpus it grounds 36 of 101 findings, and 4 of 60 fact citations. Two
  // samples are entirely exact and four are almost entirely not, which is why the
  // normalised pass below is the workhorse rather than the fallback.
  const exactAt = document.indexOf(trimmed);
  if (exactAt !== -1) {
    return {
      status: 'grounded',
      location: {
        start: exactAt,
        end: exactAt + trimmed.length,
        method: 'exact',
        similarity: 1,
        matchedText: trimmed,
      },
    };
  }

  const haystack = index ?? foldForMatching(document);
  const needle = foldForMatching(trimmed).folded;
  if (needle.length < 2) return { status: 'unverified', reason: 'quote_too_short' };

  // 2. Normalised. Smart quotes, PDF spacing damage, casing drift.
  const foldedAt = haystack.folded.indexOf(needle);
  if (foldedAt !== -1) {
    return {
      status: 'grounded',
      location: toSourceRange(document, haystack, foldedAt, needle.length, 'normalised', 1),
    };
  }

  // 3. Bounded fuzzy. OCR noise, a dropped word or two.
  return locateFuzzy(document, haystack, needle, options);
}

/**
 * Coarse-to-fine window scan.
 *
 * The coarse pass steps by an eighth of the needle width, so a 100k-character
 * document costs a few thousand Dice evaluations rather than a hundred thousand;
 * the fine pass then re-scans single-character offsets around the winner. A second,
 * non-overlapping candidate scoring nearly as well makes the match ambiguous — and
 * ambiguous means unverified, because citing the wrong clause is worse than citing none.
 */
function locateFuzzy(
  document: string,
  haystack: FoldedText,
  needle: string,
  options: LocateOptions,
): GroundingOutcome {
  const width = needle.length;
  const stride = Math.max(1, Math.floor(width / 8));
  const limit = haystack.folded.length - Math.floor(width * 0.8);
  if (limit <= 0) return { status: 'unverified', reason: 'not_found' };

  const coarse = scanRange(haystack.folded, needle, 0, limit, stride);
  if (coarse.at === -1) return { status: 'unverified', reason: 'not_found' };

  const refined = scanRange(
    haystack.folded,
    needle,
    Math.max(0, coarse.at - stride),
    Math.min(limit, coarse.at + stride),
    1,
  );
  if (refined.score < options.minSimilarity) {
    return { status: 'unverified', reason: 'below_threshold' };
  }

  const runnerUp = bestOutside(haystack.folded, needle, refined.at, width, stride, limit);
  if (runnerUp >= options.minSimilarity && refined.score - runnerUp < options.ambiguityMargin) {
    return { status: 'unverified', reason: 'ambiguous' };
  }

  return {
    status: 'grounded',
    location: toSourceRange(document, haystack, refined.at, width, 'fuzzy', refined.score),
  };
}

/** Best-scoring window start in `[from, to]`, stepping by `stride`. */
function scanRange(
  folded: string,
  needle: string,
  from: number,
  to: number,
  stride: number,
): { at: number; score: number } {
  let at = -1;
  let score = 0;
  for (let position = from; position <= to; position += stride) {
    const candidate = diceCoefficient(needle, folded.slice(position, position + needle.length));
    if (candidate > score) {
      score = candidate;
      at = position;
    }
  }
  return { at, score };
}

/** Best score achievable by a window that does not overlap the chosen match. */
function bestOutside(
  folded: string,
  needle: string,
  chosenAt: number,
  width: number,
  stride: number,
  limit: number,
): number {
  const before = scanRange(folded, needle, 0, Math.min(limit, chosenAt - width), stride);
  const after = scanRange(folded, needle, Math.max(0, chosenAt + width), limit, stride);
  return Math.max(before.score, after.score);
}

/**
 * Map a range in fold space back to a range in the caller's original string.
 *
 * The end offset is taken from the last folded character and advanced by one, so the
 * returned span is half-open and `document.slice(start, end)` covers the match.
 */
function toSourceRange(
  document: string,
  haystack: FoldedText,
  foldedStart: number,
  foldedLength: number,
  method: GroundingMethod,
  similarity: number,
): QuoteLocation {
  const start = haystack.offsets[foldedStart] ?? 0;
  const lastIndex = Math.min(foldedStart + foldedLength - 1, haystack.offsets.length - 1);
  const end = (haystack.offsets[lastIndex] ?? start) + 1;
  return { start, end, method, similarity, matchedText: document.slice(start, end) };
}
