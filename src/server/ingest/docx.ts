import 'server-only';
import mammoth from 'mammoth';

import type { RawExtraction } from '@/core/document/types';

import { IngestError } from './errors';

/**
 * DOCX text extraction, via `mammoth`.
 *
 * `extractRawText` rather than `convertToHtml`: the canonical document is plain text
 * and every offset in the system indexes into it, so converting to HTML only to strip
 * the tags again would insert a lossy round trip between the file and the string that
 * citations are measured against.
 *
 * Styling is discarded deliberately. Bold and italics carry no legal weight, and
 * preserving them would tempt a later change to make the model read formatting as
 * emphasis — which is exactly the kind of inference this product computes rather than
 * asks for.
 */

/**
 * A DOCX has no pages until something lays it out, and this never lays it out. Reporting
 * no page marks is honest; inventing "page 1" would put a wrong page number on a
 * citation, which is worse than putting none.
 */
const NO_PAGES: readonly string[] = [];

export async function extractDocx(bytes: Uint8Array): Promise<RawExtraction> {
  let value: string;
  try {
    // `mammoth`'s Node reader accepts `buffer` only; the `arrayBuffer` form in its type
    // declarations is the browser build's input and is rejected at runtime here.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    value = result.value;
  } catch (error) {
    throw new IngestError(
      'not_a_document',
      'This Word file could not be read. It may be damaged, or saved in the older .doc ' +
        'format — re-save it as .docx and try again.',
      { cause: error },
    );
  }

  if (value.trim().length === 0) {
    throw new IngestError(
      'empty',
      'This Word file contains no text. If the content is an image or a scan, upload the ' +
        'PDF version instead.',
    );
  }

  return {
    text: value,
    pageTexts: NO_PAGES,
    source: 'docx',
    // The text comes from the file's own character data, so offsets into it are exact.
    offsetsReliable: true,
  };
}
