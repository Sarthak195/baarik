import type { Span } from '../document/types';
import type { InconsistencySeverity } from './types';

/**
 * What a number in a contract is about.
 *
 * Comparing numbers is trivial; deciding that two numbers describe the same thing is
 * the whole problem. It is decided here against a closed vocabulary rather than by
 * open-ended similarity, because an open comparison would pair the deposit with the
 * rent and bury the real findings under arithmetic coincidences. A small vocabulary
 * under-detects, and under-detection is the failure this product can live with:
 * a missed conflict leaves the reader where they already were, while a fabricated
 * one costs them their trust in everything else in the report.
 */

export type Family = 'duration' | 'money' | 'rate';

export interface Concept {
  readonly id: string;
  /** Used in the finding's own prose, so it reads as a noun phrase. */
  readonly label: string;
  readonly pattern: RegExp;
  readonly severity: InconsistencySeverity;
}

export const CONCEPTS: readonly Concept[] = [
  { id: 'notice', label: 'the notice period', pattern: /\bnotice\b/gi, severity: 'high' },
  { id: 'lock_in', label: 'the lock-in period', pattern: /\block[\s-]?in\b/gi, severity: 'high' },
  {
    id: 'deposit',
    label: 'the security deposit',
    pattern: /\b(?:security\s+)?deposit\b/gi,
    severity: 'high',
  },
  { id: 'rent', label: 'the rent', pattern: /\brent(?:al)?\b/gi, severity: 'high' },
  { id: 'interest', label: 'the interest rate', pattern: /\binterest\b/gi, severity: 'medium' },
  {
    id: 'probation',
    label: 'the probation period',
    pattern: /\bprobation(?:ary)?\b/gi,
    severity: 'medium',
  },
  {
    id: 'non_compete',
    label: 'the non-compete period',
    pattern: /\bnon[\s-]?compet\w*\b/gi,
    severity: 'medium',
  },
  {
    id: 'cure',
    label: 'the cure period',
    pattern: /\b(?:cure|rectif\w+|remedy)\b/gi,
    severity: 'medium',
  },
];

/**
 * The concept named nearest the quantity, or null when nothing names it.
 *
 * Both sides are searched because English puts the noun on either side of the number
 * with equal happiness — "notice of thirty days" and "thirty (30) days notice" say
 * the same thing — and a backwards-only search would miss the second, which is the
 * more common form in Indian drafting.
 */
export function conceptNear(text: string, span: Span, window: number): Concept | null {
  const from = Math.max(0, span.start - window);
  const haystack = text.slice(from, span.end + window);
  const localStart = span.start - from;
  const localEnd = span.end - from;

  let best: Concept | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const concept of CONCEPTS) {
    concept.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = concept.pattern.exec(haystack)) !== null) {
      const end = match.index + match[0].length;
      const distance = end <= localStart ? localStart - end : Math.max(0, match.index - localEnd);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = concept;
      }
    }
  }

  return best;
}
