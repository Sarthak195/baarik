/**
 * String similarity for fuzzy quote location.
 *
 * Sørensen–Dice over character bigrams is used rather than edit distance. Two
 * reasons, both practical:
 *
 *   - It is O(n + m) with no dynamic-programming matrix, and quote location scans
 *     a window across an entire contract, so the constant factor matters.
 *   - The errors that actually occur — an OCR substitution, a hyphenation artefact,
 *     one dropped word — degrade Dice gently. Edit distance falls off a cliff on a
 *     single early insertion, which would reject quotes that are plainly correct.
 */

/** Multiset of character bigrams: key is the 2-character gram, value its count. */
export function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const gram = value.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Sørensen–Dice coefficient over character bigrams, in `[0, 1]`.
 *
 * Counts are compared as multisets, so a repeated phrase does not inflate the score
 * the way a set-based implementation would.
 *
 * @returns 1 for identical strings, 0 when either string is shorter than 2 characters.
 */
export function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);

  let overlap = 0;
  let leftTotal = 0;
  for (const [gram, count] of leftGrams) {
    leftTotal += count;
    overlap += Math.min(count, rightGrams.get(gram) ?? 0);
  }

  let rightTotal = 0;
  for (const count of rightGrams.values()) rightTotal += count;

  return (2 * overlap) / (leftTotal + rightTotal);
}
