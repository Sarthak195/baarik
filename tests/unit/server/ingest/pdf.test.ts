import { describe, expect, it, vi } from 'vitest';

import { LIMITS } from '@/server/config/limits';
import { buildPdfExtraction, extractPdf } from '@/server/ingest/pdf';
import { IngestError } from '@/server/ingest/errors';

import { buildPdf, densePage } from './fixtures';

vi.mock('server-only', () => ({}));

describe('buildPdfExtraction — the scanned-document guard', () => {
  it('trusts a page with a real text layer', () => {
    const page = 'a'.repeat(LIMITS.minPdfCharsPerPage * 4);
    const extraction = buildPdfExtraction([page, page]);

    expect(extraction.likelyScanned).toBe(false);
    expect(extraction.offsetsReliable).toBe(true);
    expect(extraction.source).toBe('pdf');
  });

  it('flags a document whose pages carry only page furniture', () => {
    // What a scanner's text layer typically contains: a header and a page number.
    const extraction = buildPdfExtraction(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);

    expect(extraction.likelyScanned).toBe(true);
    // Offsets into a text layer this thin point at nothing a reader can see, so a
    // citation has to be reported at page granularity instead.
    expect(extraction.offsetsReliable).toBe(false);
    expect(extraction.source).toBe('pdf');
  });

  it('averages across pages rather than judging each one alone', () => {
    // A dense contract with one near-blank signature page is not a scan.
    const dense = 'a'.repeat(LIMITS.minPdfCharsPerPage * 5);
    expect(buildPdfExtraction([dense, dense, 'Signed:']).likelyScanned).toBe(false);
  });

  it('treats an entirely empty text layer as scanned, not as empty', () => {
    // Empty means "nothing to analyse"; scanned means "ask the model to read the images".
    // Collapsing the two would send a photographed contract to a 422.
    const extraction = buildPdfExtraction(['', '']);

    expect(extraction.likelyScanned).toBe(true);
    expect(extraction.text).toBe('\n\n');
  });

  it('sits on the declared threshold rather than near it', () => {
    const belowByOne = 'a'.repeat(LIMITS.minPdfCharsPerPage - 1);
    const atThreshold = 'a'.repeat(LIMITS.minPdfCharsPerPage);

    expect(buildPdfExtraction([belowByOne]).likelyScanned).toBe(true);
    expect(buildPdfExtraction([atThreshold]).likelyScanned).toBe(false);
  });

  it('keeps page texts separate so page marks can be built from them', () => {
    const extraction = buildPdfExtraction(['one', 'two']);
    expect(extraction.pageTexts).toEqual(['one', 'two']);
  });
});

describe('extractPdf', () => {
  it('returns one entry per page, in order', async () => {
    const bytes = buildPdf([densePage('A'), densePage('B'), densePage('C')]);

    const extraction = await extractPdf(bytes);
    expect(extraction.pageTexts).toHaveLength(3);
    expect(extraction.pageTexts[0]).toContain('A1:');
    expect(extraction.pageTexts[2]).toContain('C1:');
    expect(extraction.likelyScanned).toBe(false);
  });

  it('flags a real PDF whose pages carry almost no text', async () => {
    const bytes = buildPdf(['Page 1', 'Page 2', 'Page 3']);

    const extraction = await extractPdf(bytes);
    expect(extraction.likelyScanned).toBe(true);
    expect(extraction.offsetsReliable).toBe(false);
    // No OCR is attempted: the fallback is Gemini reading the page images, and that
    // belongs in the pipeline, not in a parser.
    expect(extraction.text.length).toBeLessThan(LIMITS.minPdfCharsPerPage);
  });

  it('leaves the caller bytes intact, because the vision fallback re-sends them', async () => {
    const bytes = buildPdf([densePage('A')]);
    const before = bytes.byteLength;

    await extractPdf(bytes);

    // PDF.js transfers its input buffer to the worker port, which detaches it. Passing
    // the caller's own array would leave this at zero.
    expect(bytes.byteLength).toBe(before);
    expect(bytes[0]).toBe(0x25);
  });

  it('refuses a PDF with more pages than the limit', async () => {
    const pages = Array.from(
      { length: LIMITS.maxPdfPages + 1 },
      (_unused, index) => `Page ${String(index + 1)}`,
    );
    const bytes = buildPdf(pages);

    const thrown: unknown = await extractPdf(bytes).catch((cause: unknown) => cause);
    expect(thrown).toBeInstanceOf(IngestError);
    expect(thrown instanceof IngestError ? thrown.reason : '').toBe('too_large');
  });

  it('reports a damaged PDF as not a document rather than as a server fault', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nbroken');

    const thrown: unknown = await extractPdf(bytes).catch((cause: unknown) => cause);
    expect(thrown).toBeInstanceOf(IngestError);
    expect(thrown instanceof IngestError ? thrown.status : 0).toBe(422);
  });
});
