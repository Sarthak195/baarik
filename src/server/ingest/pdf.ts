import 'server-only';
import { extractText, getDocumentProxy } from 'unpdf';

import type { RawExtraction } from '@/core/document/types';
import { LIMITS } from '@/server/config/limits';

import { IngestError } from './errors';

/**
 * PDF text extraction, via `unpdf`.
 *
 * `unpdf` ships PDF.js compiled for serverless runtimes, which is the whole reason it
 * is here: `pdf-parse`, the obvious choice and the one a model writes from memory,
 * depends on `canvas` and therefore on a native binary that does not exist in a Vercel
 * or Workers image. That failure appears at deploy time, not at install time, which is
 * the worst moment to discover it.
 */

/**
 * A `RawExtraction` that also says whether the text layer was believable.
 *
 * `RawExtraction` already carries `offsetsReliable`, but that field answers "can I trust
 * character offsets?" and the pipeline needs to answer a different question: "should I
 * re-read this document with Gemini's PDF vision?". Keeping them separate means the
 * vision fallback is triggered by an explicit decision rather than inferred from a flag
 * that happens to correlate with it today.
 */
export interface PdfExtraction extends RawExtraction {
  readonly source: 'pdf';
  /** True when the text layer is too thin to be real text — a scan, almost certainly. */
  readonly likelyScanned: boolean;
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  // PDF.js transfers the input buffer to its worker port, which detaches it. Handing it
  // our caller's array would leave that array empty, and the caller still needs those
  // bytes: the vision fallback re-sends the same PDF to the model.
  const owned = new Uint8Array(bytes);

  const document = await race(getDocumentProxy(owned), 'open');
  const pageCount = document.numPages;

  if (pageCount === 0) {
    throw new IngestError('empty', 'This PDF has no pages.');
  }

  // Checked against the page tree before a single page is rendered to text, because the
  // cost this limit exists to refuse is the extraction, not the parse of the catalogue.
  if (pageCount > LIMITS.maxPdfPages) {
    throw new IngestError(
      'too_large',
      `This PDF has ${String(pageCount)} pages; the limit is ${String(LIMITS.maxPdfPages)}. ` +
        'Upload the agreement itself rather than the whole bundle.',
    );
  }

  const { text: pageTexts } = await race(extractText(document, { mergePages: false }), 'extract');
  return buildPdfExtraction(pageTexts);
}

/**
 * Assemble the extraction and judge whether the text layer is real.
 *
 * Separated from the I/O above so the scanned-document rule — the part with actual
 * consequences for a user — is a pure function over page texts and can be tested
 * without a PDF at all.
 */
export function buildPdfExtraction(pageTexts: readonly string[]): PdfExtraction {
  const text = pageTexts.join('\n\n');
  const charsPerPage = pageTexts.length === 0 ? 0 : text.length / pageTexts.length;
  const likelyScanned = text.trim().length === 0 || charsPerPage < LIMITS.minPdfCharsPerPage;

  return {
    text,
    pageTexts,
    source: 'pdf',
    // A near-empty text layer means the characters that exist are page furniture, not
    // the contract, so an offset into them points at nothing a reader can see. No OCR is
    // attempted here: the fallback is Gemini reading the page images, and that belongs
    // in the pipeline where a model call is expected, not in a parser.
    offsetsReliable: !likelyScanned,
    likelyScanned,
  };
}

/**
 * Half the request budget, so a slow-but-successful extraction still leaves the model
 * calls enough time to finish. A PDF that needs longer than a minute to open is not a
 * PDF this product is going to analyse well anyway.
 */
const PDF_STAGE_BUDGET_MS = LIMITS.requestTimeoutMs / 2;

/**
 * Bound one PDF.js operation.
 *
 * A malformed PDF can send PDF.js into a very long recovery pass — "indexing all
 * objects" over a file whose cross-reference table is a lie — and a serverless function
 * that hangs costs its full timeout and returns nothing. This is an honest bound rather
 * than a complete one: `unpdf`'s serverless build runs on the event loop with no worker
 * thread, so the timer fires between await points and cannot interrupt a synchronous
 * spin. It converts the common case, slow recovery, into a clean 422.
 */
async function race<T>(work: Promise<T>, stage: 'open' | 'extract'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new IngestError(
          'not_a_document',
          'This PDF could not be read in reasonable time. It may be damaged; try re-exporting it.',
        ),
      );
    }, PDF_STAGE_BUDGET_MS);
  });

  // `Promise.race` leaves the loser unobserved. If the timeout wins and the parse fails
  // afterwards, Node reports an unhandled rejection for a result nobody is waiting for.
  void work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    throw asIngestError(error, stage);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a PDF.js failure into something the API layer can answer with.
 *
 * PDF.js reports by exception class name rather than by code, so the name is what gets
 * read. An unrecognised failure becomes `not_a_document` rather than propagating: by the
 * time these bytes reached a parser they had already passed a magic-byte check, so a
 * failure here means the file is broken, not that the server is.
 */
function asIngestError(error: unknown, stage: 'open' | 'extract'): IngestError {
  if (error instanceof IngestError) return error;

  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return new IngestError(
      'encrypted',
      'This PDF is password-protected. Remove the password and upload it again.',
      { cause: error },
    );
  }

  const detail = stage === 'open' ? 'could not be opened' : 'could not be read';
  return new IngestError('not_a_document', `This PDF ${detail}. The file appears to be damaged.`, {
    cause: error,
  });
}
