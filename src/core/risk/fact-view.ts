import type {
  ConstructId,
  ExtractedFacts,
  NumericFactField,
  Presence,
} from '../../schemas/extracted-facts';
import { foldForMatching } from '../document/fold';
import { locateQuote } from '../grounding/locate';
import type { QuoteLocation } from '../grounding/types';
import type { CanonicalDocument } from '../document/types';
import type { FactView } from './types';

/**
 * Building the rubric's view of a document, with every fact checked against the text.
 *
 * This is where the chain in ADR 0004 is actually implemented. A number the model
 * reported but could not evidence is demoted to null; a null makes every predicate
 * that needs it return `unknown`; an `unknown` becomes a numbered question in the
 * lawyer-preparation pack. So a fact the model invented does not become a risk
 * finding — it becomes a question worth asking an advocate.
 *
 * Demotion is deliberately conservative in one direction only. A fact with no
 * citation at all is kept, because the extraction prompt asks for citations on a
 * best-effort basis and dropping every uncited number would gut the rubric. A fact
 * whose citation was supplied and does not appear in the document is dropped,
 * because that is positive evidence the model was confabulating.
 */

export interface DemotedFact {
  readonly field: string;
  readonly reason: 'citation_not_found';
}

export interface FactViewResult {
  readonly view: FactView;
  readonly demoted: readonly DemotedFact[];
  /** Citations that were supplied and verified, keyed by field name. */
  readonly evidence: ReadonlyMap<string, QuoteLocation>;
}

export function buildFactView(
  document: CanonicalDocument,
  facts: ExtractedFacts,
): FactViewResult {
  const index = foldForMatching(document.text);
  const evidence = new Map<string, QuoteLocation>();
  const demoted: DemotedFact[] = [];
  const suppressed = new Set<string>();

  for (const citation of facts.citations) {
    const outcome = locateQuote(document.text, citation.exactQuote, undefined, index);
    if (outcome.status === 'grounded') {
      evidence.set(citation.field, outcome.location);
    } else {
      demoted.push({ field: citation.field, reason: 'citation_not_found' });
      suppressed.add(citation.field);
    }
  }

  // A construct asserted "present" must be able to point at the clause. One that
  // cannot is downgraded to "unclear" rather than to "absent": failing to evidence a
  // clause is not evidence that the clause is missing, and reporting it as missing
  // would accuse the contract of an omission on the strength of a bad quote.
  const constructs = new Map<ConstructId, Presence>();
  for (const assertion of facts.constructs) {
    if (assertion.presence !== 'present') {
      constructs.set(assertion.construct, assertion.presence);
      continue;
    }

    if (assertion.exactQuote === null || assertion.exactQuote.trim().length === 0) {
      constructs.set(assertion.construct, 'present');
      continue;
    }

    const outcome = locateQuote(document.text, assertion.exactQuote, undefined, index);
    if (outcome.status === 'grounded') {
      evidence.set(assertion.construct, outcome.location);
      constructs.set(assertion.construct, 'present');
    } else {
      demoted.push({ field: assertion.construct, reason: 'citation_not_found' });
      constructs.set(assertion.construct, 'unclear');
    }
  }

  const view: FactView = {
    documentType: facts.documentType,
    number: (field: NumericFactField) => (suppressed.has(field) ? null : readNumber(facts, field)),
    construct: (id: ConstructId) => constructs.get(id) ?? 'unclear',
    evidenceFor: (name: string) => evidence.get(name) ?? null,
  };

  return { view, demoted, evidence };
}

/**
 * Read one numeric field.
 *
 * The cast is confined to this function and is safe by construction: `NumericFactField`
 * is derived from the schema as exactly those keys whose value type is `number | null`,
 * so the lookup cannot yield anything else.
 */
function readNumber(facts: ExtractedFacts, field: NumericFactField): number | null {
  const value: unknown = facts[field];
  return typeof value === 'number' ? value : null;
}
