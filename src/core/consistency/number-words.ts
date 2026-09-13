/**
 * Number words, Indian scale included.
 *
 * Indian contracts state every quantity that matters twice — "ninety (90) days",
 * "Rupees Two Lakh (Rs. 2,00,000)" — a convention inherited from cheque writing and
 * kept because the words survive a bad photocopy. That redundancy is what this file
 * exists to collect: two independent statements of one quantity can be compared, and
 * when they disagree the document contradicts itself in a way that needs no legal
 * interpretation to report.
 */

const WORD_VALUES: ReadonlyMap<string, number> = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fourty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);

const SCALES: ReadonlyMap<string, number> = new Map([
  ['hundred', 100],
  ['thousand', 1_000],
  ['lakh', 100_000],
  ['lakhs', 100_000],
  ['lac', 100_000],
  ['lacs', 100_000],
  ['million', 1_000_000],
  ['crore', 10_000_000],
  ['crores', 10_000_000],
  ['billion', 1_000_000_000],
]);

/** Words that sit inside a written amount without changing it. */
const IGNORED: ReadonlySet<string> = new Set([
  'and',
  'rupees',
  'rupee',
  'inr',
  'rs',
  'only',
]);

/**
 * Trailing tokens that separate a quantity from its unit. Stripping them is what
 * lets "thirty (30) calendar days" and "7 working days" be read as quantities at
 * all, rather than as unparseable text next to a unit noun.
 */
const TRAILING_NOISE =
  /(?:[\s)\],:;–-]+|\b(?:working|business|calendar|clear|consecutive|full|whole|complete|percent|cent|per|annum)\b)+$/i;

const TRAILING_DIGITS = /(\d[\d,]*(?:\.\d+)?)$/;
const TRAILING_WORD = /([A-Za-z]+)$/;

export interface TrailingValue {
  readonly value: number;
  /** Index within the searched window where the value's own text begins. */
  readonly start: number;
}

/** True when a token can appear inside a written number without ending it. */
export function isNumberWord(token: string): boolean {
  const lower = token.toLowerCase();
  return WORD_VALUES.has(lower) || SCALES.has(lower) || IGNORED.has(lower);
}

/**
 * Parse a fully written number. Returns null on any token that is not part of one,
 * so that a phrase which merely contains "one" ("one of the parties") is rejected
 * rather than read as 1.
 */
export function parseNumberWords(phrase: string): number | null {
  const tokens = phrase
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length > 0);

  let total = 0;
  let current = 0;
  let sawDigit = false;

  for (const token of tokens) {
    const value = WORD_VALUES.get(token);
    if (value !== undefined) {
      current += value;
      sawDigit = true;
      continue;
    }

    const scale = SCALES.get(token);
    if (scale !== undefined) {
      // "hundred" multiplies what precedes it and stays in play ("one hundred and
      // twenty"); the larger scales close off a group ("two lakh fifty thousand").
      const multiplicand = current === 0 ? 1 : current;
      if (scale === 100) {
        current = multiplicand * 100;
      } else {
        total += multiplicand * scale;
        current = 0;
      }
      sawDigit = true;
      continue;
    }

    if (IGNORED.has(token)) continue;
    return null;
  }

  return sawDigit ? total + current : null;
}

/** The written number ending at the end of `window`, if the window ends in one. */
export function trailingNumberWords(window: string): TrailingValue | null {
  const words: string[] = [];
  let cursor = window.length;

  for (;;) {
    const head = window.slice(0, cursor).replace(TRAILING_NOISE, '');
    const match = TRAILING_WORD.exec(head);
    const word = match?.[1];
    if (word === undefined || !isNumberWord(word)) break;
    words.unshift(word);
    cursor = head.length - word.length;
  }

  if (words.length === 0) return null;
  const value = parseNumberWords(words.join(' '));
  return value === null ? null : { value, start: cursor };
}

/** The digit-form number ending at the end of `window`, if the window ends in one. */
export function trailingFigure(window: string): TrailingValue | null {
  const head = window.replace(TRAILING_NOISE, '');
  const match = TRAILING_DIGITS.exec(head);
  const digits = match?.[1];
  if (digits === undefined) return null;

  const value = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { value, start: head.length - digits.length };
}

/**
 * The quantity ending at the end of `window`, in whichever form it is written.
 *
 * Where a document writes both ("thirty (30)"), the figure supplies the value —
 * it is what a reader's eye lands on, and where the two disagree that disagreement
 * is reported separately rather than silently resolved here. The span still reaches
 * back over the words, so a highlight covers the quantity as printed instead of a
 * fragment starting mid-bracket.
 */
export function trailingValue(window: string): TrailingValue | null {
  const figure = trailingFigure(window);
  if (figure === null) return trailingNumberWords(window);

  const words = trailingNumberWords(window.slice(0, figure.start).replace(/[\s(]+$/, ''));
  return words === null ? figure : { value: figure.value, start: words.start };
}
