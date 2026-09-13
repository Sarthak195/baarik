import 'server-only';

/**
 * Every bound the server enforces, in one table.
 *
 * The security posture of an upload endpoint is the set of numbers it refuses to
 * exceed. Scattering those numbers across the code that applies them means a reviewer
 * has to read the whole ingest path to answer "how big an upload can a stranger
 * send?". Collecting them here makes the answer a single file, and makes a change to
 * one of them a visible diff rather than a buried constant.
 *
 * Nothing here is a preference. Each number is a refusal, and the comment says what
 * it is protecting against.
 */
export const LIMITS = {
  /**
   * A scanned 40-page lease from a phone camera lands around 8 MB; a genuine contract
   * essentially never exceeds this. Above it the likeliest explanations are a mis-drag
   * or someone probing the endpoint, and both are better served by a fast 413 than by
   * a function that spends its whole budget decoding.
   */
  maxUploadBytes: 10 * 1024 * 1024,

  /**
   * Long enough for a debenture trust deed with schedules, short enough that a
   * thousand-page PDF bomb cannot monopolise the runtime. Checked against the page
   * count in the PDF catalogue before any page is rendered to text.
   */
  maxPdfPages: 120,

  /**
   * Mirrors `CANONICALISE_DEFAULTS.maxChars`. Roughly 100k tokens — inside the model's
   * window with room for the system instruction, the schema and the answer. Exceeding
   * it truncates and says so; it never silently analyses half a contract.
   */
  maxCanonicalChars: 400_000,

  /**
   * Half the canonical cap. Pasted text arrives already decoded in a request body, so
   * the ceiling is lower than for a file: the cost is paid before the handler can
   * refuse, and a body this size is already an unusual amount of prose to paste.
   */
  maxPasteChars: 200_000,

  /**
   * Below this many characters per page, a PDF's text layer is absent rather than
   * sparse — the page is an image of a document. A dense legal page runs 2,000-3,000
   * characters, so 200 sits an order of magnitude below normal and still clears the
   * page numbers and running headers that a scanner's text layer often carries alone.
   */
  minPdfCharsPerPage: 200,

  /**
   * A report longer than this is not read, it is skimmed, and a skimmed report hides
   * its own worst finding among sixty others. The cap is a product decision as much as
   * a resource one: past it, extra findings cost attention rather than adding it.
   */
  maxFindings: 60,

  /**
   * A follow-up question, not a second document. Anything longer is an attempt to
   * smuggle instructions past the document boundary, and truncating it silently would
   * be worse than refusing it.
   */
  maxQuestionChars: 500,

  /**
   * The whole pipeline — extraction, model calls, verification — against one wall
   * clock. Set below the platform's own function timeout so the failure is ours and
   * carries a message, rather than the platform's and carrying none.
   */
  requestTimeoutMs: 120_000,

  /**
   * Per-client token bucket. The pool of free Gemini keys is small and shared, so the
   * scarce resource being protected is quota, not CPU. `capacity` allows a burst of a
   * dozen — a demo where one evaluator uploads several documents quickly — while
   * `refillPerMinute` caps the sustained rate well under what a scripted loop wants.
   */
  rateLimit: { capacity: 12, refillPerMinute: 4 },
} as const;

export type Limits = typeof LIMITS;
