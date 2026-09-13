/**
 * Rupee notation parsing.
 *
 * Indian contracts write money in ways that defeat naive parsing: the digit grouping
 * is 2-2-3 from the right ("1,50,000"), and amounts are routinely stated in lakh and
 * crore rather than in full. A model asked for a plain number will usually comply and
 * will sometimes hand back the string it read, so the server normalises defensively
 * on the way in regardless.
 *
 * Getting this wrong is not cosmetic: `securityDepositInr / monthlyRentInr >= 3` is a
 * risk rule, and misreading "2,00,000" as 2 would silently clear a predatory bond.
 */

const MULTIPLIERS: readonly (readonly [RegExp, number])[] = [
  [/\bcrores?\b|\bcr\b/i, 1e7],
  [/\blakhs?\b|\blacs?\b|\blakh\b/i, 1e5],
  [/\bmillions?\b|\bmn\b/i, 1e6],
  [/\bthousands?\b|\bk\b/i, 1e3],
];

/** Currency markers and separators that carry no numeric meaning. */
const NOISE = /[₹]|\brs\.?\b|\binr\b|\brupees?\b|\bonly\b|\/-/gi;

/**
 * Parse a rupee amount into a plain number.
 *
 * Returns `null` rather than a guess whenever the input is not confidently a single
 * amount — an unparseable figure becomes an `unknown` fact, which becomes a question
 * for the user's lawyer. A wrong number would instead become a wrong risk score.
 *
 * @example
 * parseRupees('Rs. 2,00,000')  // 200000
 * parseRupees('₹1.5 lakh')     // 150000
 * parseRupees('2 Cr')          // 20000000
 * parseRupees('not a number')  // null
 */
export function parseRupees(raw: string): number | null {
  const cleaned = raw.replace(NOISE, ' ').trim();
  if (cleaned.length === 0) return null;

  const multiplier = MULTIPLIERS.find(([pattern]) => pattern.test(cleaned))?.[1] ?? 1;

  // Take the first number-like run. Commas are grouping separators in every Indian
  // convention, so they are removed rather than interpreted as decimal points.
  const numeric = /-?\d[\d,]*(?:\.\d+)?/.exec(cleaned);
  if (!numeric) return null;

  const value = Number(numeric[0].replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) return null;

  // A multiplier word with a fractional figure is normal ("1.5 lakh"); without one,
  // a fractional rupee amount is almost certainly an extraction artefact, but it is
  // still a number the caller can reason about, so it is returned as-is.
  const total = value * multiplier;
  return Number.isFinite(total) ? total : null;
}

/**
 * Express an amount as a multiple of a base, for rules like "deposit is more than
 * three months' rent".
 *
 * Returns `null` when either side is unknown or the base is zero, so that an unknown
 * propagates rather than collapsing into a comparison that happens to be false.
 */
export function asMultipleOf(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) return null;
  return value / base;
}
