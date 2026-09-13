import { describe, expect, it } from 'vitest';

import { TemplateError, formatIndianNumber, renderExplanation } from '@/core/risk/template';
import { fakeFacts } from '../../../fakes/fact-view';

describe('formatIndianNumber', () => {
  const cases: readonly (readonly [number, string])[] = [
    [0, '0'],
    [500, '500'],
    [1_000, '1,000'],
    // The 2-2-3 grouping is the whole reason this is not Intl's default.
    [100_000, '1,00,000'],
    [150_000, '1,50,000'],
    [1_200_000, '12,00,000'],
    [20_000_000, '2,00,00,000'],
    [1_234.5, '1,234.5'],
  ];

  for (const [input, expected] of cases) {
    it(`formats ${String(input)} as ${expected}`, () => {
      expect(formatIndianNumber(input)).toBe(expected);
    });
  }

  it('keeps a negative sign outside the grouping', () => {
    expect(formatIndianNumber(-150_000)).toBe('-1,50,000');
  });
});

describe('renderExplanation', () => {
  it('interpolates this document’s own figures', () => {
    const facts = fakeFacts({
      numbers: { noticeDaysYouMustGive: 90, noticeDaysTheyMustGive: 30 },
    });

    expect(
      renderExplanation(
        'You must give {noticeDaysYouMustGive} days while they need only {noticeDaysTheyMustGive}.',
        'notice_asymmetry',
        facts,
      ),
    ).toBe('You must give 90 days while they need only 30.');
  });

  it('leaves text without placeholders untouched', () => {
    expect(renderExplanation('No placeholders here.', 'r', fakeFacts({}))).toBe(
      'No placeholders here.',
    );
  });

  /**
   * Rendering the literal text "{noticePeriod}" to someone reading about their own
   * contract destroys trust in everything around it, so a typo in a YAML rule fails
   * loudly rather than shipping.
   */
  it('throws on a placeholder naming a field that does not exist', () => {
    expect(() =>
      renderExplanation('You get {noticePeriod} days.', 'typo_rule', fakeFacts({})),
    ).toThrow(TemplateError);
  });

  it('throws when a rule interpolates a value this document never yielded', () => {
    // Reaching this means the predicate and the template disagree about what the rule
    // needs — the rule fired without the number its own text describes.
    expect(() =>
      renderExplanation('Deposit is Rs. {securityDepositInr}.', 'deposit_rule', fakeFacts({})),
    ).toThrow(/did not yield/);
  });

  it('names the offending rule so a maintainer can find it', () => {
    try {
      renderExplanation('{nonsenseField}', 'rule_under_test', fakeFacts({}));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateError);
      expect((error as TemplateError).ruleId).toBe('rule_under_test');
    }
  });

  it('applies the injected formatter', () => {
    const facts = fakeFacts({ numbers: { securityDepositInr: 300_000 } });

    expect(
      renderExplanation('Rs. {securityDepositInr}', 'r', facts, formatIndianNumber),
    ).toBe('Rs. 3,00,000');
  });
});
