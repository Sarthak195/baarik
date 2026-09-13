import { describe, expect, it } from 'vitest';

import {
  findSegments,
  normaliseText,
  pageNumberAt,
  segmentIdAt,
  toCanonicalDocument,
} from '@/core/document/normalise';
import type { RawExtraction } from '@/core/document/types';

function extraction(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    text: '',
    pageTexts: [],
    source: 'text',
    offsetsReliable: true,
    ...overrides,
  };
}

describe('normaliseText', () => {
  it('rejoins a word hyphenated across a line break', () => {
    expect(normaliseText('training cost reimburse-\nment shall be payable')).toBe(
      'training cost reimbursement shall be payable',
    );
  });

  it('leaves a genuine compound spanning a line break intact', () => {
    // "twenty-four" is one word either side of the break; joining would give "twentyfour".
    expect(normaliseText('a period of twenty-four\nmonths')).toBe('a period of twenty-four\nmonths');
  });

  it('collapses runs of spaces and blank lines without destroying paragraph structure', () => {
    expect(normaliseText('7.1  The    Tenant\n\n\n\n7.2  The Landlord')).toBe(
      '7.1 The Tenant\n\n7.2 The Landlord',
    );
  });

  it('normalises CRLF and strips zero-width characters', () => {
    expect(normaliseText('clause\r\none​two')).toBe('clause\nonetwo');
  });
});

describe('findSegments', () => {
  it('finds numbered clauses and tiles the document with them', () => {
    const text = ['7.1 First clause text.', '', '7.2 Second clause text.', '', '8. Third.'].join(
      '\n',
    );
    const segments = findSegments(text);

    expect(segments.map((segment) => segment.label)).toEqual(['7.1', '7.2', '8']);
    // Segments are contiguous, so an offset lookup is a containment test.
    expect(segments[0]?.span.end).toBe(segments[1]?.span.start);
    expect(segments[2]?.span.end).toBe(text.length);
  });

  it('ignores a clause number appearing mid-sentence as a cross-reference', () => {
    const segments = findSegments('1. The Tenant shall comply with clause 7.2 at all times.');
    expect(segments.map((segment) => segment.label)).toEqual(['1']);
  });
});

describe('toCanonicalDocument', () => {
  it('reports truncation instead of silently analysing half a contract', () => {
    const document = toCanonicalDocument(extraction({ text: 'x'.repeat(500) }), 'hash', {
      maxChars: 100,
    });

    expect(document.truncated).toBe(true);
    expect(document.text).toHaveLength(100);
  });

  it('does not flag truncation for a document within the cap', () => {
    const document = toCanonicalDocument(extraction({ text: 'short agreement' }), 'hash');
    expect(document.truncated).toBe(false);
  });

  it('maps offsets back to page numbers', () => {
    const pageOne = '1. The Tenant shall pay rent monthly in advance without demand.';
    const pageTwo = '2. The Landlord shall maintain the structure of the premises.';
    const document = toCanonicalDocument(
      extraction({ text: `${pageOne}\n\n${pageTwo}`, pageTexts: [pageOne, pageTwo] }),
      'hash',
    );

    expect(pageNumberAt(document, 5)).toBe(1);
    expect(pageNumberAt(document, document.text.indexOf('Landlord'))).toBe(2);
  });

  it('resolves an offset to the clause that contains it', () => {
    const document = toCanonicalDocument(
      extraction({ text: '7.1 First clause.\n\n7.2 Second clause here.' }),
      'hash',
    );

    const first = segmentIdAt(document, 2);
    const second = segmentIdAt(document, document.text.indexOf('Second'));

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });
});
