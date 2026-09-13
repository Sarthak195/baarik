import { describe, expect, it, vi } from 'vitest';

import { detectAndExtract, IngestError } from '@/server/ingest/detect';
import { LIMITS } from '@/server/config/limits';

import { buildDocx, buildPdf, buildZip, densePage } from './fixtures';

vi.mock('server-only', () => ({}));

const ENCODER = new TextEncoder();

/** Asserts the reason rather than the message, since the reason is what a route maps on. */
async function reasonOf(work: Promise<unknown>): Promise<string> {
  const thrown: unknown = await work.then(
    () => null,
    (cause: unknown) => cause,
  );
  if (!(thrown instanceof IngestError)) {
    throw new Error(`Expected an IngestError, got ${String(thrown)}`);
  }
  return thrown.reason;
}

describe('detectAndExtract — limits', () => {
  it('refuses an oversize upload before it looks at a single content byte', async () => {
    // The bytes are not a document at all, so a sniff-then-size order would report
    // `not_a_document`. Getting `too_large` back is the evidence that size came first.
    const oversize = new Uint8Array(LIMITS.maxUploadBytes + 1);

    expect(await reasonOf(detectAndExtract({ bytes: oversize, filename: 'huge.pdf' }))).toBe(
      'too_large',
    );
  });

  it('refuses a paste longer than the paste cap', async () => {
    const text = 'x'.repeat(LIMITS.maxPasteChars + 1);
    expect(await reasonOf(detectAndExtract({ text }))).toBe('too_large');
  });

  it('lets a file exactly at the cap through the size check', async () => {
    // An off-by-one here refuses a legitimate document, so the boundary is pinned. These
    // bytes are not a document, so the reason that comes back proves only one thing:
    // whatever refused them, it was not the size check.
    const atCap = new Uint8Array(LIMITS.maxUploadBytes);

    expect(await reasonOf(detectAndExtract({ bytes: atCap }))).not.toBe('too_large');
  });

  it('reads a normal upload end to end', async () => {
    const pdf = buildPdf([densePage('A')]);

    const extraction = await detectAndExtract({ bytes: pdf });
    expect(extraction.source).toBe('pdf');
  });
});

describe('detectAndExtract — empty input', () => {
  it('rejects an absent body', async () => {
    expect(await reasonOf(detectAndExtract({}))).toBe('empty');
  });

  it('rejects a zero-length file', async () => {
    expect(await reasonOf(detectAndExtract({ bytes: new Uint8Array(0) }))).toBe('empty');
  });

  it('rejects whitespace-only pasted text', async () => {
    expect(await reasonOf(detectAndExtract({ text: '   \n\t  ' }))).toBe('empty');
  });
});

describe('detectAndExtract — magic bytes over filenames', () => {
  it('reads a PDF whatever it is called', async () => {
    const bytes = buildPdf([densePage('A'), densePage('B')]);

    const extraction = await detectAndExtract({ bytes, filename: 'lease.txt' });
    expect(extraction.source).toBe('pdf');
    expect(extraction.pageTexts).toHaveLength(2);
    expect(extraction.text).toContain('the Tenant shall pay the rent monthly');
  });

  it('reads a DOCX named .pdf, because the bytes decide and the name does not', async () => {
    const bytes = buildDocx(['The Employee shall not solicit any client for twenty-four months.']);

    const extraction = await detectAndExtract({ bytes, filename: 'agreement.pdf' });
    expect(extraction.source).toBe('docx');
    expect(extraction.text).toContain('twenty-four months');
    // A DOCX has no pages until something lays it out, and nothing here does.
    expect(extraction.pageTexts).toEqual([]);
  });

  it('refuses a .pdf that is really a plain ZIP rather than handing it to a parser', async () => {
    const bytes = buildZip([{ name: 'notes.txt', content: 'nothing legal in here' }]);

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'contract.pdf' }))).toBe(
      'unsupported_type',
    );
  });

  it('says so when a file named .pdf is not a container at all', async () => {
    const bytes = ENCODER.encode('this is just prose, not a pdf');

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'contract.pdf' }))).toBe(
      'not_a_document',
    );
  });

  it('tolerates junk before the %PDF- header, as every real reader does', async () => {
    const preamble = ENCODER.encode('Received: from mail\r\n\r\n');
    const pdf = buildPdf([densePage('A')]);
    const bytes = new Uint8Array(preamble.byteLength + pdf.byteLength);
    bytes.set(preamble, 0);
    bytes.set(pdf, preamble.byteLength);

    const extraction = await detectAndExtract({ bytes });
    expect(extraction.source).toBe('pdf');
  });
});

describe('detectAndExtract — refusals', () => {
  it('reports a password-protected archive as encrypted, not as corrupt', async () => {
    // Bit 0 of the general-purpose flag is what a ZIP sets on every encrypted entry.
    const bytes = buildZip([{ name: 'word/document.xml', content: 'ciphertext', flags: 0x0001 }]);

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'locked.docx' }))).toBe('encrypted');
  });

  it('reports a legacy or protected Office container as an unsupported type', async () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'old.doc' }))).toBe(
      'unsupported_type',
    );
  });

  it('reports binary noise as not a document rather than as mojibake text', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'scan.png' }))).toBe(
      'not_a_document',
    );
  });

  it('reports a damaged PDF as not a document', async () => {
    const bytes = ENCODER.encode('%PDF-1.4\nthe rest of this file never arrived');

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'truncated.pdf' }))).toBe(
      'not_a_document',
    );
  });

  it('carries an HTTP status so a route never has to invent one', async () => {
    const thrown: unknown = await detectAndExtract({}).catch((cause: unknown) => cause);
    expect(thrown).toBeInstanceOf(IngestError);
    expect(thrown instanceof IngestError ? thrown.status : 0).toBe(422);
  });
});

describe('detectAndExtract — plain text', () => {
  it('passes pasted text through verbatim, with offsets declared reliable', async () => {
    const text = '7.1 The Tenant shall pay ₹25,000 per month.';

    const extraction = await detectAndExtract({ text });
    expect(extraction).toEqual({
      text,
      pageTexts: [],
      source: 'text',
      offsetsReliable: true,
    });
  });

  it('reads an uploaded UTF-8 text file', async () => {
    const bytes = ENCODER.encode('7.1 The Tenant shall pay ₹25,000 per month.');

    const extraction = await detectAndExtract({ bytes, filename: 'lease.txt' });
    expect(extraction.source).toBe('text');
    expect(extraction.text).toContain('₹25,000');
  });

  it('refuses a text file that is not UTF-8 rather than mangling the rupee sign', async () => {
    // 0x92 is a curly apostrophe in Windows-1252 and an illegal lead byte in UTF-8.
    const bytes = new Uint8Array([0x54, 0x68, 0x65, 0x20, 0x92, 0x73, 0x20, 0x66, 0x65, 0x65]);

    expect(await reasonOf(detectAndExtract({ bytes, filename: 'lease.txt' }))).toBe(
      'not_a_document',
    );
  });

  it('prefers pasted text when both a file and text are supplied', async () => {
    const bytes = buildPdf([densePage('A')]);

    const extraction = await detectAndExtract({ bytes, text: 'pasted clause 7.1' });
    expect(extraction.source).toBe('text');
  });
});
