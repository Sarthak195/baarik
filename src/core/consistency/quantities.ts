import type { CanonicalDocument, Span } from '../document/types';
import { parseRupees } from '../finance/rupees';
import { conceptNear, type Concept, type Family } from './concepts';
import { trailingValue } from './number-words';
import { describeSite, siteAt } from './site';
import { CONSISTENCY_DEFAULTS, type ConsistencyOptions, type Inconsistency } from './types';

/**
 * The same concept given two different values in two different clauses — a notice
 * period of thirty days in clause 7 and of sixty days in clause 12.
 *
 * A reader cannot catch this. Catching it means holding every number in the contract
 * in mind at once and noticing that two of them are about the same obligation, which
 * is the one thing a few lines of grouping code do perfectly and attention does not.
 */

const DURATION_UNIT = /\b(days?|weeks?|months?|years?)\b/gi;
const MONEY = /(?:₹\s*|\bRs\.?\s*|\bINR\s+|\bRupees\s+)[\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|crores?|thousand))?/gi;
const RATE = /\d+(?:\.\d+)?\s*(?:%|per\s*cent|percent)/gi;

/** How far back from a unit the value may sit: "thirty (30) calendar" and no further. */
const VALUE_LOOKBACK = 48;

interface Quantity {
  readonly concept: Concept;
  readonly family: Family;
  readonly value: number;
  readonly span: Span;
}

export function findConflictingQuantities(
  document: CanonicalDocument,
  options: ConsistencyOptions = CONSISTENCY_DEFAULTS,
): readonly Inconsistency[] {
  const quantities = [
    ...scanDurations(document.text, options),
    ...scanPattern(document.text, MONEY, 'money', options, (raw) => parseRupees(raw)),
    ...scanPattern(document.text, RATE, 'rate', options, (raw) => parseRupees(raw)),
  ].sort((left, right) => left.span.start - right.span.start);

  const groups = new Map<string, Quantity[]>();
  for (const quantity of quantities) {
    const key = `${quantity.concept.id}|${quantity.family}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(quantity);
    else groups.set(key, [quantity]);
  }

  const findings: Inconsistency[] = [];
  for (const bucket of groups.values()) {
    findings.push(...conflictsWithin(document, bucket));
  }
  return findings;
}

/**
 * Report each distinct value against the first one stated.
 *
 * Two values are only a conflict when they sit in different clauses. Two different
 * numbers inside one clause are almost always a deliberate carve-out that the clause
 * itself reconciles ("thirty days, or ninety days during the first year"); across
 * clauses, there is no sentence left to reconcile them and the reader is on their own.
 * The same rule makes an unnumbered document silent, which matches the cross-reference
 * detector: without clause boundaries there is nothing to attribute a conflict to.
 */
function conflictsWithin(
  document: CanonicalDocument,
  bucket: readonly Quantity[],
): readonly Inconsistency[] {
  const first = bucket[0];
  if (first === undefined) return [];

  const baseline = siteAt(document, first.span);
  const findings: Inconsistency[] = [];
  const reported = new Set<number>([first.value]);

  for (const quantity of bucket.slice(1)) {
    if (reported.has(quantity.value)) continue;
    const at = siteAt(document, quantity.span);
    if (at.segmentId === null || baseline.segmentId === null) continue;
    if (at.segmentId === baseline.segmentId) continue;
    reported.add(quantity.value);

    findings.push({
      kind: 'conflicting_quantity',
      severity: quantity.concept.severity,
      title: `${capitalise(quantity.concept.label)} is stated differently in two clauses`,
      detail: `${capitalise(quantity.concept.label)} is stated as "${baseline.quote.trim()}" in ${describeSite(baseline)} and as "${at.quote.trim()}" in ${describeSite(at)}.${asymmetryCaveat(quantity)}`,
      at,
      counterpart: baseline,
    });
  }

  return findings;
}

/**
 * A notice period that differs between the parties is a real drafting pattern, not
 * always an error — one month for the employer, three for the employee. The finding
 * is kept rather than suppressed because that asymmetry is itself worth seeing; the
 * caveat is what stops it reading as an accusation.
 */
function asymmetryCaveat(quantity: Quantity): string {
  return quantity.family === 'duration'
    ? ' If the two clauses bind different parties this may be deliberate, and it is then worth checking which one applies to you.'
    : '';
}

function scanDurations(text: string, options: ConsistencyOptions): readonly Quantity[] {
  const quantities: Quantity[] = [];
  DURATION_UNIT.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = DURATION_UNIT.exec(text)) !== null) {
    const unit = match[1];
    if (unit === undefined) continue;

    const windowStart = Math.max(0, match.index - VALUE_LOOKBACK);
    const found = trailingValue(text.slice(windowStart, match.index));
    if (found === null) continue;

    const span = { start: windowStart + found.start, end: match.index + match[0].length };
    const concept = conceptNear(text, span, options.conceptWindow);
    if (concept === null) continue;

    quantities.push({
      concept,
      family: 'duration',
      value: found.value * dayFactor(unit, options),
      span,
    });
  }

  return quantities;
}

function scanPattern(
  text: string,
  pattern: RegExp,
  family: Family,
  options: ConsistencyOptions,
  read: (raw: string) => number | null,
): readonly Quantity[] {
  const quantities: Quantity[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = read(match[0]);
    if (value === null) continue;

    const span = { start: match.index, end: match.index + match[0].length };
    const concept = conceptNear(text, span, options.conceptWindow);
    if (concept === null) continue;

    quantities.push({ concept, family, span, value });
  }

  return quantities;
}

function dayFactor(unit: string, options: ConsistencyOptions): number {
  const lower = unit.toLowerCase();
  if (lower.startsWith('week')) return 7;
  if (lower.startsWith('month')) return options.monthDays;
  if (lower.startsWith('year')) return options.yearDays;
  return 1;
}

function capitalise(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
