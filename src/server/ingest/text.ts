import 'server-only';

import type { RawExtraction } from '@/core/document/types';

import { IngestError } from './errors';

/**
 * The paste box and the `.txt` upload.
 *
 * There is nothing to parse, so the only real work is refusing input that is not text
 * at all. That refusal matters more than it looks: without it, an image or an
 * executable renamed to `.txt` becomes a wall of replacement characters, and the model
 * is then asked to find clauses in mojibake and will duly invent some.
 */

/** Page marks describe a paginated source. Pasted text has no pages, so it claims none. */
const NO_PAGES: readonly string[] = [];

const NUL = String.fromCharCode(0);

export function extractPlainText(text: string): RawExtraction {
  if (text.trim().length === 0) {
    throw new IngestError('empty', 'There is no text to analyse. Paste or upload a document.');
  }

  return {
    text,
    pageTexts: NO_PAGES,
    source: 'text',
    // The canonical text is derived from exactly these characters, so every offset
    // computed against it is exact.
    offsetsReliable: true,
  };
}

/**
 * Decode an uploaded `.txt`.
 *
 * Strict UTF-8, with no fallback encoding. Guessing between Windows-1252, Latin-1 and
 * UTF-8 is guessing, and a wrong guess corrupts exactly the characters this product
 * cannot afford to corrupt — ₹, the rupee sign, and the curly quotes that appear inside
 * defined terms. A refusal that says "save it as UTF-8" is recoverable; a document
 * silently read in the wrong encoding is not.
 */
export function decodePlainText(bytes: Uint8Array): string {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new IngestError(
      'not_a_document',
      'This file is not readable as text. If it is a plain-text document, save it as UTF-8; ' +
        'otherwise upload the PDF or Word original.',
      { cause: error },
    );
  }

  // NUL is valid UTF-8 and never appears in prose, so it is the cheapest reliable
  // signal that a binary file decoded by coincidence rather than by being text.
  if (decoded.includes(NUL)) {
    throw new IngestError(
      'not_a_document',
      'This file looks like binary data rather than a document. Upload a PDF, a Word file ' +
        'or plain text.',
    );
  }

  return decoded;
}
