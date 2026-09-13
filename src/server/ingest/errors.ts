import 'server-only';

/**
 * Why an upload was refused.
 *
 * The reasons are discriminated rather than collapsed into one message because the API
 * layer has to answer a different question for each of them, and a caller can only act
 * on a distinction the response actually makes. "Too large" means send something
 * smaller, "unsupported type" means send something else, and "encrypted" means remove
 * the password first — three different user actions behind what would otherwise be one
 * indistinguishable 500.
 */
export type IngestFailure =
  /** Over `LIMITS.maxUploadBytes`, `maxPasteChars` or `maxPdfPages`. Detected before parsing. */
  | 'too_large'
  /** A recognised format this product does not read: an image, a spreadsheet, a plain ZIP. */
  | 'unsupported_type'
  /** Password-protected. The bytes are a document; they are simply not readable here. */
  | 'encrypted'
  /** No bytes, no text, or a file whose extracted text is blank. */
  | 'empty'
  /** Claims to be a document and is not — a truncated PDF, a corrupt archive, binary noise. */
  | 'not_a_document';

/** HTTP status per reason, so the mapping is declared once instead of per route. */
const STATUS: Readonly<Record<IngestFailure, 413 | 415 | 422>> = {
  too_large: 413,
  unsupported_type: 415,
  encrypted: 422,
  empty: 422,
  not_a_document: 422,
};

/**
 * Messages are written for the person who uploaded the file, so they say what to do
 * next rather than what went wrong internally. None of them may quote the document: an
 * error message is a log line waiting to happen, and document content must not end up
 * in a log.
 */
export class IngestError extends Error {
  readonly reason: IngestFailure;
  /** 413, 415 or 422 — never 500. A refused upload is the caller's problem to fix. */
  readonly status: 413 | 415 | 422;

  constructor(reason: IngestFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IngestError';
    this.reason = reason;
    this.status = STATUS[reason];
  }
}

/** A guard, so a route can branch on ingest failures without importing the class shape. */
export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError;
}
