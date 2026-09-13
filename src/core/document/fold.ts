/**
 * Text folding for quote matching.
 *
 * A language model asked to copy a clause verbatim will usually succeed, and will
 * occasionally return the same clause with a curly apostrophe straightened, a line
 * break collapsed, or an en-dash normalised. Those are not hallucinations and must
 * not be treated as such.
 *
 * Folding projects text into a comparison space where those differences vanish,
 * while recording, for every surviving character, the offset it came from. That
 * offset map is the entire point: a match found in fold space is reported as a
 * range in the caller's original string, so a highlight lands on real characters.
 */

export interface FoldedText {
  readonly folded: string;
  /** `offsets[i]` is the index in the source string that produced `folded[i]`. */
  readonly offsets: Int32Array;
}

/**
 * Typographic variants that PDF extractors and language models interchange freely.
 * Folding these is safe: no legal meaning distinguishes a curly quote from a straight
 * one. Folding anything semantic — digits, currency symbols, negation — would not be.
 *
 * Written as escapes rather than literals so the table stays reviewable in a diff.
 */
const TYPOGRAPHIC_FOLD: ReadonlyMap<string, string> = new Map([
  ['‘', "'"], // left single quotation mark
  ['’', "'"], // right single quotation mark / apostrophe
  ['‚', "'"], // single low-9 quotation mark
  ['‛', "'"], // single high-reversed-9 quotation mark
  ['′', "'"], // prime
  ['“', '"'], // left double quotation mark
  ['”', '"'], // right double quotation mark
  ['„', '"'], // double low-9 quotation mark
  ['″', '"'], // double prime
  ['‐', '-'], // hyphen
  ['‑', '-'], // non-breaking hyphen
  ['‒', '-'], // figure dash
  ['–', '-'], // en dash
  ['—', '-'], // em dash
  ['―', '-'], // horizontal bar
  ['−', '-'], // minus sign
  [' ', ' '], // no-break space
  [' ', ' '], // thin space
  [' ', ' '], // narrow no-break space
]);

/**
 * Zero-width characters that PDF text layers scatter through extracted strings:
 * soft hyphen, ZWSP, ZWNJ, ZWJ, word joiner, BOM.
 */
const INVISIBLE = /[­​‌‍⁠﻿]/;

/**
 * Project `source` into match space — invisibles dropped, typographic variants
 * folded, whitespace runs collapsed to a single space, lower-cased — and record the
 * source offset behind every retained character.
 *
 * Leading whitespace produces no output, so the folded string never starts with a
 * space and index 0 always corresponds to real content.
 *
 * @example
 * foldForMatching('The  "Lock-in"\nperiod').folded === 'the "lock-in" period'
 */
export function foldForMatching(source: string): FoldedText {
  const characters: string[] = [];
  const offsets: number[] = [];
  let pendingSpace = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) continue;
    if (INVISIBLE.test(character)) continue;

    const mapped = TYPOGRAPHIC_FOLD.get(character) ?? character;

    if (/\s/.test(mapped)) {
      // Defer the space: a run of whitespace becomes at most one, and trailing
      // whitespace becomes none.
      pendingSpace = characters.length > 0;
      continue;
    }

    if (pendingSpace) {
      characters.push(' ');
      offsets.push(index);
      pendingSpace = false;
    }

    characters.push(mapped.toLowerCase());
    offsets.push(index);
  }

  return { folded: characters.join(''), offsets: Int32Array.from(offsets) };
}
