import { toCanonicalDocument } from '@/core/document/normalise';
import type { CanonicalDocument } from '@/core/document/types';

/**
 * Build a canonical document from clause text the way the real pipeline would, so
 * the tests exercise the same `findSegments` output the detectors rely on rather
 * than a hand-written segment list that could drift away from it.
 */
export function contract(...lines: readonly string[]): CanonicalDocument {
  return toCanonicalDocument(
    { text: lines.join('\n'), pageTexts: [], source: 'text', offsetsReliable: true },
    'test-hash',
  );
}

/** The text each finding points at, which is what a user would see highlighted. */
export function quotes(findings: readonly { readonly at: { readonly quote: string } }[]): string[] {
  return findings.map((finding) => finding.at.quote.trim());
}
