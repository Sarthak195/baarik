import type { CanonicalDocument } from '../document/types';
import { describeSite, siteAt } from './site';
import type { Inconsistency } from './types';

/**
 * Dangling cross-references: "as provided in Clause 14.2" where the document has no
 * clause 14.2.
 *
 * This is the cheapest real defect in a contract to find mechanically and among the
 * most consequential, because a dangling reference usually means a clause was cut
 * from a template and the obligation that pointed at it now points nowhere. It is
 * also the check a reader is least able to perform: verifying one reference means
 * scanning the whole document, and a contract has dozens.
 */

const CLAUSE_WORDS = 'sub-?clauses?|clauses?|sections?|articles?|paragraphs?|paras?';
const SCHEDULE_WORDS = 'schedules?|annexures?|annexes?|appendices|appendix|exhibits?';
const LABEL = String.raw`\d+(?:\.\d+)*|[A-Za-z]{1,3}`;
const JOINERS = String.raw`,|and|&|to|through`;

/** "Clause 7", "Clauses 7, 8 and 9", "Schedule A". The label list is always last. */
const REFERENCE = new RegExp(
  String.raw`\b(${CLAUSE_WORDS}|${SCHEDULE_WORDS})\s+((?:${LABEL})(?:\s*(?:${JOINERS})\s*(?:${LABEL}))*)`,
  'gi',
);

const LABEL_TOKEN = new RegExp(`(?:${LABEL})`, 'g');
const SCHEDULE_KEYWORD = /^(?:schedule|annexure|annex|appendix|exhibit)/i;

/** A schedule heading as printed: "SCHEDULE A", "Annexure - II", "Appendix 1". */
const SCHEDULE_HEADING =
  /^[ \t]*(?:schedule|annexure|annex|appendix|exhibit)\s*[-–—:]?\s*["'‘“]?([A-Za-z0-9]{1,3})\b/gim;

/**
 * "Section 138 of the Negotiable Instruments Act" is a citation of statute, not a
 * pointer into this document, and flagging it would make the whole report useless in
 * an Indian contract — they cite statute constantly. The test is case-sensitive
 * because statute names are capitalised, and lower-casing it would swallow ordinary
 * prose such as "under the act of any party".
 */
const STATUTE_CONTEXT =
  /^\s*(?:of|under|read with)\s+(?:the\s+)?[^.\n]{0,70}?\b(?:Act|Code|Rules|Regulations|Constitution|Ordinance)\b/;

export function findDanglingCrossReferences(document: CanonicalDocument): readonly Inconsistency[] {
  const clauseLabels = knownClauseLabels(document);
  const scheduleLabels = knownScheduleLabels(document.text);

  // A document whose numbering never survived extraction would report every single
  // reference as dangling. That is not a finding about the contract, it is a finding
  // about the PDF, and burying the user in it would discredit the real ones.
  if (clauseLabels.size === 0) return [];

  const findings: Inconsistency[] = [];
  REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = REFERENCE.exec(document.text)) !== null) {
    const whole = match[0];
    const keyword = match[1];
    const labelList = match[2];
    if (keyword === undefined || labelList === undefined) continue;

    // A match at the start of a line is the clause's own heading, not a reference to it.
    if (atLineStart(document.text, match.index)) continue;

    const after = document.text.slice(match.index + whole.length, match.index + whole.length + 90);
    if (STATUTE_CONTEXT.test(after)) continue;

    const isSchedule = SCHEDULE_KEYWORD.test(keyword);
    // Schedules are rarely numbered in a way `findSegments` can see, so we only claim
    // one is missing when the document visibly declares schedules and this is not
    // among them. A contract whose schedules were stapled on separately must not be
    // accused of losing them.
    if (isSchedule && scheduleLabels.size === 0) continue;

    const known = isSchedule ? scheduleLabels : clauseLabels;
    const listStart = match.index + whole.length - labelList.length;

    for (const token of labelTokens(labelList)) {
      if (isKnown(token.text, known, isSchedule)) continue;
      const span = { start: listStart + token.offset, end: listStart + token.offset + token.text.length };
      const at = siteAt(document, span);
      findings.push({
        kind: 'dangling_cross_reference',
        severity: 'high',
        title: `Reference to ${keyword.toLowerCase()} ${token.text}, which this document does not contain`,
        detail: `${describeSite(at)} points at ${keyword.toLowerCase()} ${token.text}. No such ${isSchedule ? 'schedule' : 'clause'} appears in this document, so the obligation it refers to cannot be read.`,
        at,
        counterpart: null,
      });
    }
  }

  return findings;
}

/**
 * Whether the referenced label exists.
 *
 * A reference to "7" is satisfied by a clause labelled "7", and also by "7.1": many
 * Indian contracts print the sub-clauses and leave the parent as an unnumbered
 * heading ("TERMINATION"), so demanding an exact "7" would flag a document that is
 * perfectly coherent. The converse is deliberately not allowed — the existence of
 * clause 7 says nothing about whether a clause 7.1 was ever drafted, and "as per
 * clause 7.1" pointing into a clause that has no sub-divisions is exactly the defect
 * this detector is for.
 */
function isKnown(label: string, known: ReadonlySet<string>, isSchedule: boolean): boolean {
  if (known.has(label)) return true;
  if (isSchedule) return known.has(label.toUpperCase());
  const childPrefix = `${label}.`;
  for (const entry of known) {
    if (entry.startsWith(childPrefix)) return true;
  }
  return false;
}

function knownClauseLabels(document: CanonicalDocument): ReadonlySet<string> {
  const labels = new Set<string>();
  for (const segment of document.segments) {
    if (segment.label === null) continue;
    // Roman-numeral headings keep their printed trailing dot ("IV."); a reference
    // never writes one.
    const label = segment.label.replace(/\.$/, '');
    if (/^\d/.test(label)) labels.add(label);
  }
  return labels;
}

function knownScheduleLabels(text: string): ReadonlySet<string> {
  const labels = new Set<string>();
  SCHEDULE_HEADING.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCHEDULE_HEADING.exec(text)) !== null) {
    const label = match[1];
    if (label !== undefined) labels.add(label.toUpperCase());
  }
  return labels;
}

/**
 * The checkable labels inside a reference such as "7, 8 and 9". Joining words are
 * dropped by requiring a label to be either digits or genuinely upper-case: "and"
 * and "to" are three letters and would otherwise pass for schedule labels.
 */
function labelTokens(list: string): readonly { text: string; offset: number }[] {
  const tokens: { text: string; offset: number }[] = [];
  LABEL_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABEL_TOKEN.exec(list)) !== null) {
    const text = match[0];
    if (/^\d/.test(text) || /^[A-Z]+$/.test(text)) tokens.push({ text, offset: match.index });
  }
  return tokens;
}

function atLineStart(text: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const character = text[cursor];
    if (character === '\n') return true;
    if (character !== ' ' && character !== '\t') return false;
  }
  return true;
}
