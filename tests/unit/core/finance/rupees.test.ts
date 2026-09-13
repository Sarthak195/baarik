import { describe, expect, it } from 'vitest';

import { asMultipleOf, parseRupees } from '@/core/finance/rupees';

/**
 * Misreading an amount is not a cosmetic bug here: `securityDeposit / monthlyRent >= 3`
 * is a risk rule, so reading "2,00,000" as 2 would silently clear a predatory bond.
 */
describe('parseRupees', () => {
  const cases: readonly (readonly [string, number | null])[] = [
    // Indian 2-2-3 digit grouping.
    ['Rs. 2,00,000', 200_000],
    ['1,50,000', 150_000],
    ['₹3,00,000/-', 300_000],
    ['INR 45000', 45_000],
    // Scale words, including fractional amounts.
    ['₹1.5 lakh', 150_000],
    ['2 lakhs', 200_000],
    ['1 lac', 100_000],
    ['2 Cr', 20_000_000],
    ['1.25 crore', 12_500_000],
    // Noise words a contract wraps around the figure.
    ['Rupees 50,000 only', 50_000],
    ['Rs.75,000/- only', 75_000],
    // Plain numbers.
    ['0', 0],
    ['30000', 30_000],
    // Refusals: a guess here becomes a wrong risk score, so null is the safe answer.
    ['not a number', null],
    ['', null],
    ['   ', null],
    ['Rs.', null],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)} as ${String(expected)}`, () => {
      expect(parseRupees(input)).toBe(expected);
    });
  }

  it('applies the largest matching scale word rather than the first digit run alone', () => {
    // "2" and "lakh" must combine; reading only the digits would be off by 1e5.
    expect(parseRupees('2 lakh')).toBe(200_000);
    expect(parseRupees('2')).toBe(2);
  });
});

describe('asMultipleOf', () => {
  it('expresses a value as a multiple of a base', () => {
    expect(asMultipleOf(300_000, 30_000)).toBe(10);
  });

  it('propagates unknown rather than inventing a comparison', () => {
    expect(asMultipleOf(null, 30_000)).toBeNull();
    expect(asMultipleOf(300_000, null)).toBeNull();
    // A zero base would divide to Infinity and read as maximal risk.
    expect(asMultipleOf(300_000, 0)).toBeNull();
  });
});
