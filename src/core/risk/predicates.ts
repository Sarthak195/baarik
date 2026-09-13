import type { FactView, Predicate, Trilean } from './types';

/**
 * Three-valued predicate evaluation, Kleene strong logic.
 *
 * The invariant this file exists to hold: **totality over ignorance**. If a predicate
 * needs a fact the document did not yield, it answers `unknown` and never `false`.
 *
 * That matters because the rubric's fourth tier tests for missing protections. Under
 * two-valued logic, "the agreement sets no deposit-refund deadline" and "we could not
 * read the agreement" are the same answer, and a scanned document nobody could parse
 * would score as maximally predatory.
 */

/** One `false` beats any number of `unknown`s; otherwise ignorance dominates. */
function and(values: readonly Trilean[]): Trilean {
  if (values.includes('false')) return 'false';
  return values.includes('unknown') ? 'unknown' : 'true';
}

/** One `true` beats any number of `unknown`s. */
function or(values: readonly Trilean[]): Trilean {
  if (values.includes('true')) return 'true';
  return values.includes('unknown') ? 'unknown' : 'false';
}

function not(value: Trilean): Trilean {
  if (value === 'unknown') return 'unknown';
  return value === 'true' ? 'false' : 'true';
}

function compare(
  value: number | null,
  threshold: number,
  test: (left: number, right: number) => boolean,
): Trilean {
  if (value === null) return 'unknown';
  return test(value, threshold) ? 'true' : 'false';
}

/**
 * Evaluate one rubric predicate against one document's facts.
 *
 * @returns `'true'` when the rule should fire, `'false'` when it definitely should
 *   not, and `'unknown'` when the document did not say enough to decide.
 */
export function evaluatePredicate(predicate: Predicate, facts: FactView): Trilean {
  switch (predicate.op) {
    case 'gte':
      return compare(facts.number(predicate.field), predicate.value, (a, b) => a >= b);
    case 'gt':
      return compare(facts.number(predicate.field), predicate.value, (a, b) => a > b);
    case 'lte':
      return compare(facts.number(predicate.field), predicate.value, (a, b) => a <= b);
    case 'lt':
      return compare(facts.number(predicate.field), predicate.value, (a, b) => a < b);

    case 'ratio_gte': {
      const numerator = facts.number(predicate.numerator);
      const denominator = facts.number(predicate.denominator);
      if (numerator === null || denominator === null) return 'unknown';
      // A zero denominator means the other side owes no notice at all, which is
      // maximal asymmetry when this side owes something, and meaningless when it
      // owes nothing either. Documented in docs/RISK_RUBRIC.md.
      if (denominator === 0) return numerator > 0 ? 'true' : 'unknown';
      return numerator / denominator >= predicate.value ? 'true' : 'false';
    }

    case 'multiple_gte': {
      const value = facts.number(predicate.field);
      const base = facts.number(predicate.of);
      if (value === null || base === null) return 'unknown';
      const unit = base / (predicate.divideBaseBy ?? 1);
      if (unit === 0) return 'unknown';
      return value / unit >= predicate.value ? 'true' : 'false';
    }

    case 'construct_present': {
      const presence = facts.construct(predicate.construct);
      if (presence === 'unclear') return 'unknown';
      return presence === 'present' ? 'true' : 'false';
    }

    case 'construct_absent':
      return not(
        evaluatePredicate({ op: 'construct_present', construct: predicate.construct }, facts),
      );

    /**
     * Whether a NUMBER was determined. This is a guard for tier-1 and tier-2 rules,
     * never a substitute for `construct_absent`: "no figure was extracted" is a
     * statement about the extraction, while "the clause is not in the document" is a
     * statement about the contract, and only the latter is a finding.
     */
    case 'field_missing':
      return facts.number(predicate.field) === null ? 'true' : 'false';

    case 'all_of':
      return and(predicate.of.map((child) => evaluatePredicate(child, facts)));
    case 'any_of':
      return or(predicate.of.map((child) => evaluatePredicate(child, facts)));
    case 'not':
      return not(evaluatePredicate(predicate.of, facts));
  }
}

/** Field and construct names a predicate depends on, for reporting what was missing. */
export function predicateInputs(predicate: Predicate): readonly string[] {
  switch (predicate.op) {
    case 'gte':
    case 'gt':
    case 'lte':
    case 'lt':
    case 'field_missing':
      return [predicate.field];
    case 'ratio_gte':
      return [predicate.numerator, predicate.denominator];
    case 'multiple_gte':
      return [predicate.field, predicate.of];
    case 'construct_present':
    case 'construct_absent':
      return [predicate.construct];
    case 'all_of':
    case 'any_of':
      return predicate.of.flatMap(predicateInputs);
    case 'not':
      return predicateInputs(predicate.of);
  }
}
