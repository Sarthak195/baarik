import type { CanonicalDocument, Span } from '../document/types';
import { describeSite, siteAt } from './site';
import { CONSISTENCY_DEFAULTS, type ConsistencyOptions, type Inconsistency } from './types';

/**
 * Defined terms, in both directions.
 *
 * A contract's defined terms are its private vocabulary: once "Lock-in Period" is
 * capitalised and quoted, every obligation phrased in it means exactly what the
 * definitions clause says and nothing else. Two failures follow mechanically from
 * that, and both are invisible to a reader who is not holding the whole document in
 * their head — a term used but never defined (the obligation has no content), and a
 * term defined but never used (a clause was deleted, and the reader cannot tell
 * whether the deletion was intended).
 */

/**
 * Straight single quotes are deliberately not treated as term delimiters: an
 * apostrophe in "the Lessee's obligations" opens one, and the false positives from
 * chasing it outweigh the handful of contracts that quote terms that way.
 */
const QUOTED_TERM = /["“‘]([A-Z][A-Za-z0-9&.\-/ ]{1,58}?)["”’]/g;

/** "means", "shall mean", "shall have the meaning assigned to it", "refers to". */
const DEFINITION_VERB =
  /^[\s,]*(?:shall\s+|will\s+)?(?:means?\b|mean\b|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|refers?\s+to\b|is\s+defined\s+as\b|denotes?\b)/i;

/** "hereinafter referred to as the", "hereinafter called", "the term". */
const NAMING_PHRASE =
  /(?:referred\s+to\s+as|called|known\s+as|termed|the\s+term|the\s+expression)\s+(?:the\s+)?$/i;

interface QuotedOccurrence {
  readonly term: string;
  readonly span: Span;
  readonly isDefinition: boolean;
}

export function findTermInconsistencies(
  document: CanonicalDocument,
  options: ConsistencyOptions = CONSISTENCY_DEFAULTS,
): readonly Inconsistency[] {
  const occurrences = findQuotedTerms(document.text, options.maxTermChars);
  const defined = new Map<string, QuotedOccurrence>();
  for (const occurrence of occurrences) {
    if (occurrence.isDefinition && !defined.has(occurrence.term)) defined.set(occurrence.term, occurrence);
  }

  return [
    ...findUndefinedTerms(document, occurrences, defined),
    ...findUnusedDefinitions(document, defined),
  ];
}

/** A quoted capitalised term used in the body that no clause ever defines. */
function findUndefinedTerms(
  document: CanonicalDocument,
  occurrences: readonly QuotedOccurrence[],
  defined: ReadonlyMap<string, QuotedOccurrence>,
): readonly Inconsistency[] {
  const findings: Inconsistency[] = [];
  const reported = new Set<string>();

  for (const occurrence of occurrences) {
    if (occurrence.isDefinition) continue;
    if (defined.has(occurrence.term)) continue;
    // Only the first use is reported: a term used in eight clauses is one defect,
    // and eight identical findings would bury the seven other things we found.
    if (reported.has(occurrence.term)) continue;
    reported.add(occurrence.term);

    const at = siteAt(document, occurrence.span);
    findings.push({
      kind: 'undefined_term',
      severity: 'medium',
      title: `"${occurrence.term}" is used as a defined term but never defined`,
      detail: `${describeSite(at)} puts "${occurrence.term}" in quotation marks, which signals a term with a fixed contractual meaning, but no clause in this document says what it means.`,
      at,
      counterpart: null,
    });
  }

  return findings;
}

/** A term defined and then never referred to again. */
function findUnusedDefinitions(
  document: CanonicalDocument,
  defined: ReadonlyMap<string, QuotedOccurrence>,
): readonly Inconsistency[] {
  const findings: Inconsistency[] = [];

  for (const [term, definition] of defined) {
    if (isUsedOutsideDefinition(document.text, term, definition.span)) continue;
    const at = siteAt(document, definition.span);
    findings.push({
      kind: 'unused_definition',
      severity: 'low',
      title: `"${term}" is defined but never used`,
      detail: `${describeSite(at)} defines "${term}", and the term appears nowhere else. Usually the clause that relied on it was deleted from the template; check whether the protection it provided was meant to go with it.`,
      at,
      counterpart: null,
    });
  }

  return findings;
}

/**
 * Usage means an occurrence outside the definition itself, quoted or not.
 *
 * "Outside" is measured in lines rather than sentences or clauses. Sentence
 * splitting is unreliable in legal text, where "Rs. 50,000." holds two full stops
 * that end nothing; excluding the whole containing clause would go too far the other
 * way, because a definitions clause defines many terms and a term used in the
 * definition of another term is genuinely used. A definition restating its own
 * headword — "'Premises' means the premises at …, and the Premises shall include
 * the fittings" — sits on one line and is correctly not counted.
 */
function isUsedOutsideDefinition(text: string, term: string, definition: Span): boolean {
  const excluded = definingLine(text, definition);
  const pattern = new RegExp(`(?<![A-Za-z])${escapeRegExp(term)}(?![A-Za-z])`, 'g');

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index < excluded.start || match.index >= excluded.end) return true;
  }
  return false;
}

/** The line the definition sits on; normalisation guarantees line breaks survive. */
function definingLine(text: string, definition: Span): Span {
  const previousBreak = text.lastIndexOf('\n', definition.start);
  const nextBreak = text.indexOf('\n', definition.end);
  return {
    start: previousBreak + 1,
    end: nextBreak === -1 ? text.length : nextBreak,
  };
}

function findQuotedTerms(text: string, maxTermChars: number): readonly QuotedOccurrence[] {
  const occurrences: QuotedOccurrence[] = [];
  QUOTED_TERM.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = QUOTED_TERM.exec(text)) !== null) {
    const term = match[1]?.trim();
    if (term === undefined || term.length < 3 || term.length > maxTermChars) continue;

    const span = { start: match.index, end: match.index + match[0].length };
    occurrences.push({
      term,
      span,
      isDefinition: isDefinition(text, span),
    });
  }

  return occurrences;
}

/**
 * Whether this occurrence is the definition itself.
 *
 * Two forms count. The explicit one is a definition verb straight after the closing
 * quote. The other is the parenthetical baptism — `a deposit of Rs. 50,000 (the
 * "Deposit")` — which defines terms just as bindingly and is far more common in the
 * body of an Indian contract than a definitions clause is. Treating a parenthetical
 * as a definition slightly over-accepts, and that is the right way to be wrong:
 * calling a definition a definition costs nothing, while wrongly shouting that a
 * term is undefined costs the user's trust in every other finding.
 */
function isDefinition(text: string, span: Span): boolean {
  if (DEFINITION_VERB.test(text.slice(span.end, span.end + 48))) return true;

  const before = text.slice(Math.max(0, span.start - 80), span.start);
  if (NAMING_PHRASE.test(before)) return true;

  const lastOpen = before.lastIndexOf('(');
  const lastClose = before.lastIndexOf(')');
  return lastOpen > lastClose;
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
