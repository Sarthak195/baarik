import type { DocumentType } from '@/schemas/document-type';
import type { ConstructId, NumericFactField, Presence } from '@/schemas/extracted-facts';
import type { FactView } from '@/core/risk/types';

/**
 * A hand-built `FactView` for rubric tests.
 *
 * Anything omitted reads as `null` for numbers and `'unclear'` for constructs, which
 * is exactly the state a real document produces when the extractor could not decide —
 * so a test that omits a field is testing the unknown path rather than a zero.
 */
export function fakeFacts(overrides: {
  documentType?: DocumentType;
  numbers?: Partial<Record<NumericFactField, number | null>>;
  constructs?: Partial<Record<ConstructId, Presence>>;
}): FactView {
  const numbers = overrides.numbers ?? {};
  const constructs = overrides.constructs ?? {};

  return {
    documentType: overrides.documentType ?? 'rent_agreement',
    number: (field) => numbers[field] ?? null,
    construct: (id) => constructs[id] ?? 'unclear',
    evidenceFor: () => null,
  };
}
