import { describe, expect, it } from 'vitest';

import { findFigureWordMismatches } from '@/core/consistency/figures';
import { parseNumberWords } from '@/core/consistency/number-words';

import { contract, quotes } from './helpers';

describe('parseNumberWords', () => {
  const cases: readonly (readonly [string, number | null])[] = [
    ['ninety', 90],
    ['thirty six', 36],
    ['one hundred and twenty', 120],
    ['two lakh', 200_000],
    ['Rupees Two Lakh Fifty Thousand', 250_000],
    ['one crore', 10_000_000],
    ['twenty four', 24],
    // A phrase that merely contains a number word is not a number.
    ['one of the parties', null],
    ['termination', null],
    ['', null],
  ];

  for (const [phrase, expected] of cases) {
    it(`reads "${phrase}" as ${expected === null ? 'not a number' : String(expected)}`, () => {
      expect(parseNumberWords(phrase)).toBe(expected);
    });
  }
});

describe('findFigureWordMismatches', () => {
  it('flags a notice period written as thirty in words and 60 in figures', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate by giving thirty (60) days notice in writing.',
    );

    const findings = findFigureWordMismatches(document);

    expect(findings).toHaveLength(1);
    expect(quotes(findings)).toEqual(['thirty (60)']);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.detail).toContain('30');
    expect(findings[0]?.detail).toContain('60');
  });

  it('accepts ninety (90) days, where the two notations agree', () => {
    const document = contract('7. CURE', 'The default shall be cured within ninety (90) days.');

    expect(findFigureWordMismatches(document)).toEqual([]);
  });

  it('flags a deposit whose words and figures disagree by a factor of ten', () => {
    // The most expensive version of this defect: the words say two lakh, the figures
    // say twenty thousand, and nothing in the document says which one binds.
    const document = contract(
      '3. DEPOSIT',
      'The Tenant shall pay a security deposit of Rupees Two Lakh (Rs. 20,000) on execution.',
    );

    const findings = findFigureWordMismatches(document);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain('200000');
    expect(findings[0]?.detail).toContain('20000');
  });

  it('accepts Indian digit grouping when it matches the words', () => {
    const document = contract(
      '3. DEPOSIT',
      'The Tenant shall pay a security deposit of Rupees Two Lakh (Rs. 2,00,000/-) on execution.',
    );

    expect(findFigureWordMismatches(document)).toEqual([]);
  });

  it('flags the inverted notation, where the figure is outside the brackets', () => {
    const document = contract('7. NOTICE', 'The Employee shall give 90 (sixty) days notice.');

    expect(quotes(findFigureWordMismatches(document))).toEqual(['90 (sixty)']);
  });

  it('accepts an interest rate whose words and figures agree', () => {
    const document = contract(
      '9. INTEREST',
      'Arrears carry interest at eighteen percent (18%) per annum.',
    );

    expect(findFigureWordMismatches(document)).toEqual([]);
  });

  it('flags an interest rate whose words and figures disagree', () => {
    const document = contract(
      '9. INTEREST',
      'Arrears carry interest at eighteen percent (24%) per annum.',
    );

    expect(findFigureWordMismatches(document)).toHaveLength(1);
  });

  it('ignores brackets that hold a defined term rather than a restated number', () => {
    const document = contract(
      '3. DEPOSIT',
      'The Tenant shall pay a sum of Rs. 50,000 (the "Deposit") on execution.',
    );

    expect(findFigureWordMismatches(document)).toEqual([]);
  });

  it('ignores brackets that hold a cross-reference or a lettered sub-paragraph', () => {
    const document = contract(
      '3. CHARGES',
      'The charges are those set out in Schedule A (Part 2) and in paragraph (b) below.',
    );

    expect(findFigureWordMismatches(document)).toEqual([]);
  });

  it('ignores a bracketed number that restates nothing in the words before it', () => {
    const document = contract('1. SCOPE', 'The services described in clause 7 (7.1) shall apply.');

    expect(findFigureWordMismatches(document)).toEqual([]);
  });
});

/**
 * A horizontal rule above a table of figures.
 *
 * This is the shape that made `TRAILING_NOISE` in `number-words.ts` exponential. The
 * matcher used to carry a `+` on its character class inside an enclosing `(...)+`, so a
 * run of k noise characters that could not reach the end of the string was partitioned
 * 2^(k-1) ways before the match failed: 24 dashes took 290ms, and 36 never returned.
 *
 * It was reachable from an ordinary upload rather than a crafted one — `figures.ts`
 * passes a 70-character lookback for every parenthetical containing a digit, and
 * `fixtures/grocery-bill.txt` already carries a 66-character rule. Node is
 * single-threaded, so nothing could have interrupted it; the container would have stopped
 * with every other request in flight.
 *
 * The timeout is the assertion. Against the old matcher this test does not finish, so a
 * generous bound fails loudly on a regression without the flakiness of timing a duration.
 */
describe('a figure behind a long horizontal rule', () => {
  it('is read in bounded time rather than exponential time', { timeout: 2000 }, () => {
    const rule = '-'.repeat(200);
    const document = contract(
      '5. SCHEDULE OF CHARGES',
      rule,
      'Processing fee of thirty (30) percent is payable on disbursal.',
    );

    // The result matters less than returning at all, but assert it anyway so the test
    // cannot pass by the detector quietly doing nothing.
    expect(() => findFigureWordMismatches(document)).not.toThrow();
  });

  it('still reads the quantity when noise separates it from its unit', () => {
    // The one-character-per-iteration rewrite must accept exactly what the old matcher
    // did. This is the phrase the noise class exists for.
    expect(parseNumberWords('thirty')).toBe(30);
    const document = contract('Notice of ninety (90) calendar days is required.');
    expect(() => findFigureWordMismatches(document)).not.toThrow();
  });
});
