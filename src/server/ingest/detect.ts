import 'server-only';

import type { RawExtraction } from '@/core/document/types';
import { LIMITS } from '@/server/config/limits';

import { extractDocx } from './docx';
import { IngestError } from './errors';
import { extractPdf } from './pdf';
import { inspectZip, sniff } from './sniff';
import { decodePlainText, extractPlainText } from './text';

/**
 * The entry point for everything that becomes a document.
 *
 * Two rules shape this file, and both are about ordering rather than about parsing.
 *
 * First, limits are enforced before any parsing work begins. Rejecting a 50 MB upload
 * after decoding it spends the resource the limit exists to protect, which makes the
 * limit decorative — the refusal has to happen while it is still cheap.
 *
 * Second, the format is decided by the bytes. A filename and a `Content-Type` are both
 * supplied by whoever is uploading, so dispatching a parser on either one means letting
 * a stranger choose which parser runs on their bytes.
 */

export interface IngestInput {
  /** An uploaded file. */
  readonly bytes?: Uint8Array | undefined;
  /** Advisory only: it sharpens an error message and never selects a parser. */
  readonly filename?: string | undefined;
  /** Pasted text. Takes precedence when both are supplied. */
  readonly text?: string | undefined;
}

export async function detectAndExtract(input: IngestInput): Promise<RawExtraction> {
  if (input.text !== undefined && input.text.trim().length > 0) {
    return extractPastedText(input.text);
  }

  const bytes = input.bytes;
  if (bytes === undefined || bytes.byteLength === 0) {
    throw new IngestError('empty', 'No document was uploaded. Attach a file or paste the text.');
  }

  // Before the sniff, before the parse, before anything reads a second byte.
  if (bytes.byteLength > LIMITS.maxUploadBytes) {
    throw new IngestError(
      'too_large',
      `This file is ${describeMegabytes(bytes.byteLength)}; the limit is ` +
        `${describeMegabytes(LIMITS.maxUploadBytes)}.`,
    );
  }

  return await extractByFormat(bytes, claimedType(input.filename));
}

function extractPastedText(text: string): RawExtraction {
  if (text.length > LIMITS.maxPasteChars) {
    throw new IngestError(
      'too_large',
      `That is ${String(text.length)} characters; the limit for pasted text is ` +
        `${String(LIMITS.maxPasteChars)}. Upload the file instead.`,
    );
  }
  return extractPlainText(text);
}

/** What the filename claims. Never trusted — used only to explain a mismatch to the user. */
type ClaimedType = 'pdf' | 'docx' | 'text' | null;

function claimedType(filename: string | undefined): ClaimedType {
  const lowered = filename?.toLowerCase() ?? '';
  if (lowered.endsWith('.pdf')) return 'pdf';
  if (lowered.endsWith('.docx') || lowered.endsWith('.doc')) return 'docx';
  if (lowered.endsWith('.txt') || lowered.endsWith('.md')) return 'text';
  return null;
}

/**
 * Throws synchronously rather than returning a rejected promise, which is safe because
 * its only caller is an `async` function and therefore converts the throw into a
 * rejection anyway.
 */
function extractByFormat(bytes: Uint8Array, claimed: ClaimedType): Promise<RawExtraction> {
  const format = sniff(bytes);

  switch (format) {
    case 'pdf':
      return extractPdf(bytes);

    case 'zip':
      return extractZipContainer(bytes, claimed);

    case 'ole':
      // Both a legacy .doc and a password-protected .docx are OLE containers. Telling
      // the two apart needs a compound-file directory walk for no benefit: the remedy
      // offered to the user is the same either way.
      throw new IngestError(
        'unsupported_type',
        'This looks like an older or password-protected Office file. Re-save it as .docx, ' +
          'or export it as a PDF with no password.',
      );

    case 'unknown':
      if (claimed === 'pdf' || claimed === 'docx') {
        throw new IngestError(
          'not_a_document',
          `This file is named .${claimed} but its contents are not a ${claimed.toUpperCase()}. ` +
            'It may have been renamed, or the upload may have been truncated.',
        );
      }
      // No container this product recognises, so the remaining possibility is that the
      // bytes are simply text. `decodePlainText` refuses anything that is not.
      return Promise.resolve(extractPlainText(decodePlainText(bytes)));
  }
}

/**
 * A ZIP is only a document if it proves it is one.
 *
 * `.docx`, `.xlsx`, `.jar` and a compressed folder are the same four magic bytes, so an
 * archive has to contain the OOXML word-processing part before `mammoth` is allowed to
 * open it. This is also the branch that catches the classic disguise: a file named
 * `.pdf` whose bytes are a ZIP.
 */
function extractZipContainer(bytes: Uint8Array, claimed: ClaimedType): Promise<RawExtraction> {
  const zip = inspectZip(bytes);

  if (zip.encrypted) {
    throw new IngestError(
      'encrypted',
      'This file is password-protected. Remove the password and upload it again.',
    );
  }

  if (!zip.isWordProcessing) {
    throw new IngestError(
      'unsupported_type',
      claimed === 'pdf'
        ? 'This file is named .pdf but its contents are a ZIP archive. Upload the PDF itself.'
        : 'This is an archive rather than a document. Upload the PDF, Word or text file itself.',
    );
  }

  return extractDocx(bytes);
}

/** One decimal place: enough to show that 10.4 MB missed the cap, not enough to imply precision. */
function describeMegabytes(byteLength: number): string {
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export { IngestError, isIngestError } from './errors';
export type { IngestFailure } from './errors';
