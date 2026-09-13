import type { CanonicalDocument } from '../document/types';
import { findDanglingCrossReferences } from './cross-references';
import { findTermInconsistencies } from './defined-terms';
import { findFigureWordMismatches } from './figures';
import { findConflictingQuantities } from './quantities';
import { CONSISTENCY_DEFAULTS, type ConsistencyOptions, type Inconsistency } from './types';

/**
 * Everything this document says that contradicts something else it says.
 *
 * No model is consulted here and none should be. A contract's internal consistency
 * is a property of the characters on the page, so it is decided by reading the
 * characters — which is why this is the part of the report a user can verify for
 * themselves, and the part that cannot be changed by instructions hidden inside the
 * document. A prompt injection can talk a model out of a finding; it cannot talk
 * `Set.has` out of one.
 *
 * Ordering is by position in the document and then by kind, so the same document
 * always produces byte-identical output and can be asserted against a golden file.
 */
export function detectInconsistencies(
  document: CanonicalDocument,
  options: ConsistencyOptions = CONSISTENCY_DEFAULTS,
): readonly Inconsistency[] {
  return [
    ...findDanglingCrossReferences(document),
    ...findTermInconsistencies(document, options),
    ...findFigureWordMismatches(document),
    ...findConflictingQuantities(document, options),
  ].sort(byPosition);
}

/** Counts by kind, for a report header that says what was checked and what was found. */
export function countByKind(
  findings: readonly Inconsistency[],
): Readonly<Record<Inconsistency['kind'], number>> {
  const counts: Record<Inconsistency['kind'], number> = {
    dangling_cross_reference: 0,
    undefined_term: 0,
    unused_definition: 0,
    figure_word_mismatch: 0,
    conflicting_quantity: 0,
  };
  for (const finding of findings) counts[finding.kind] += 1;
  return counts;
}

function byPosition(left: Inconsistency, right: Inconsistency): number {
  if (left.at.start !== right.at.start) return left.at.start - right.at.start;
  if (left.at.end !== right.at.end) return left.at.end - right.at.end;
  return left.kind.localeCompare(right.kind);
}
