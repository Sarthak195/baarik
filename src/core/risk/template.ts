import type { NumericFactField } from '../../schemas/extracted-facts';
import { NUMERIC_FACT_FIELDS } from '../../schemas/extracted-facts';
import type { FactView } from './types';

/**
 * Rendering a rule's explanation against one document's numbers.
 *
 * A rule says "You must give {noticeDaysYouMustGive} days' notice while they need only
 * {noticeDaysTheyMustGive}" and the reader sees "90" and "30". Interpolating the
 * document's own figures is what turns a generic warning into something that is
 * visibly about the contract in front of them.
 */

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

/** Fast membership test for the numeric vocabulary. */
const NUMERIC_FIELD_SET: ReadonlySet<string> = new Set(NUMERIC_FACT_FIELDS);

export class TemplateError extends Error {
  // Declared explicitly rather than as a constructor parameter property, which
  // `erasableSyntaxOnly` forbids: it emits runtime code from a type-position syntax.
  readonly ruleId: string;

  constructor(message: string, ruleId: string) {
    super(message);
    this.name = 'TemplateError';
    this.ruleId = ruleId;
  }
}

/**
 * Substitute `{field}` placeholders with this document's values.
 *
 * Two failure modes are deliberately loud rather than quiet:
 *
 *   - An unknown placeholder throws. Rendering the literal text `{noticePeriod}` to a
 *     person reading about their own contract destroys trust in everything around it,
 *     and a typo in a YAML rule is exactly the kind of mistake that otherwise ships.
 *   - A placeholder whose value is null also throws, because a rule should not have
 *     fired at all if the number it talks about was never determined. Reaching this
 *     means the predicate and the template disagree about what the rule needs.
 *
 * @param formatNumber Injected so the caller controls locale — Indian digit grouping
 *   differs from the default, and `src/core` must not reach for `Intl` defaults that
 *   vary by environment.
 */
export function renderExplanation(
  template: string,
  ruleId: string,
  facts: FactView,
  formatNumber: (value: number) => string = String,
): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!NUMERIC_FIELD_SET.has(name)) {
      throw new TemplateError(`Rule "${ruleId}" references unknown field "${name}"`, ruleId);
    }

    const value = facts.number(name as NumericFactField);
    if (value === null) {
      throw new TemplateError(
        `Rule "${ruleId}" interpolates "${name}", which this document did not yield. ` +
          'The rule fired on a predicate that does not require the field its text describes.',
        ruleId,
      );
    }

    return formatNumber(value);
  });
}

/**
 * Indian digit grouping: 1,50,000 rather than 150,000.
 *
 * Written out rather than delegated to `Intl.NumberFormat('en-IN')` because `src/core`
 * must produce byte-identical output everywhere, and ICU data differs between Node
 * builds and browsers.
 */
export function formatIndianNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole = '', fraction] = Math.abs(rounded).toString().split('.');
  const sign = rounded < 0 ? '-' : '';

  // The last three digits group alone; everything before them groups in twos.
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped =
    rest.length > 0 ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;

  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}
