import { randomUUID, createHash } from 'node:crypto';

import { toCanonicalDocument } from '@/core/document/normalise';
import type { RawExtraction } from '@/core/document/types';
import { parseDocumentType, type OutputLanguage } from '@/schemas/document-type';
import { parseLanguage, withLanguage } from '@/i18n';
import { malformedBody, readField, readForm } from '@/lib/form-field';
import { buildReportView } from '@/server/report/view';
import { getGeminiKeyPool } from '@/server/config/env';
import { LIMITS } from '@/server/config/limits';
import { GenAiError } from '@/server/genai/errors';
import { callWithFallback } from '@/server/genai/gateway';
import { detectAndExtract, IngestError } from '@/server/ingest/detect';
import { loadKnowledge } from '@/server/knowledge/repository';
import { analysisLog } from '@/server/observability/analysis-log';
import type { FailureReason } from '@/server/observability/logger';
import { analyseDocument } from '@/server/pipeline/analyse-document';
import type { LlmGateway } from '@/server/pipeline/stages';
import { checkRateLimit } from '@/server/ratelimit/token-bucket';
import { putReport } from '@/server/store/report-store';

/**
 * Where the landing form posts.
 *
 * A route handler rather than a Server Action, deliberately. A Server Action degrades
 * to a plain POST when scripting is unavailable, but only because the framework
 * arranges it; this is a plain POST because that is all it ever was. The distinction
 * matters when the requirement is "works with JavaScript switched off" rather than
 * "usually works" — there is nothing here to degrade.
 *
 * The answer is a 303, so the browser follows it with a GET. That keeps the report URL
 * shareable and reloadable, and stops a refresh re-posting the document — which on a
 * metered free tier would spend quota every time someone pressed F5.
 */

/** Model calls are slow, and the default serverless budget is not generous enough. */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  // First, before the body is read and long before a model is called. A limiter that
  // runs after the work has been done protects nothing: the quota is already spent,
  // and quota is the scarce resource this endpoint is guarding.
  const decision = checkRateLimit(request.headers, startedAt);
  if (!decision.allowed) return tooManyRequests(decision.retryAfterSeconds);

  // `formData()` throws on a body whose content type it cannot parse. A browser always
  // sends the right one, so reaching this is a hand-crafted request — but an uncaught
  // throw here is a 500, which says the server broke when in fact the request did.
  const form = await readForm(request);
  if (form === null) return malformedBody();
  const language = parseLanguage(readField(form, 'lang'));

  try {
    const raw = await extract(form);
    const hash = createHash('sha256').update(raw.text).digest('hex');
    const document = toCanonicalDocument(raw, hash);
    const knowledge = loadKnowledge();

    // The gateway is the LlmGateway, so every stage inherits the (model, key) ladder:
    // a stage that meets a daily quota substitutes a model rather than failing the
    // whole analysis. Which pairs are spent is remembered in `genai/exhaustion.ts`,
    // process-wide, so this upload skips what the last one paid a 429 to discover.
    //
    // Asked for here rather than imported as a value: resolving the keys at module
    // load made `next build` require a credential it has no business holding.
    const keys = getGeminiKeyPool();

    // Which model actually answered, and whether it was the first choice, are known
    // only to the gateway. Captured on the way past so the log line reports what
    // happened rather than what was requested.
    let answeredBy = 'unknown';
    let degraded = false;

    const llm: LlmGateway = {
      structured: async (req) => {
        const result = await callWithFallback(req, { keys, now: Date.now() });
        answeredBy = result.model;
        if (result.degraded) degraded = true;
        return result;
      },
    };

    const outcome = await analyseDocument(
      {
        document,
        options: { language, readingLevel: 'standard', maxFindings: LIMITS.maxFindings },
        forums: knowledge.forums,
        limitation: knowledge.limitation,
        reportId: randomUUID(),
        readAsScan: !raw.offsetsReliable,
        declaredType: parseDocumentType(readField(form, 'documentType')),
      },
      {
        llm,
        knowledge: knowledge.rubric,
        enforceability: knowledge.enforceability,
        clock: () => new Date(),
      },
    );

    // Refusing is a first-class outcome. A supermarket receipt is not a failure of the
    // system, and the reader is better served by being told what they uploaded than by
    // an empty report.
    if (outcome.kind === 'not_a_document') {
      return redirect(backToForm(outcome.reason, 'refused', language));
    }

    const view = buildReportView({
      analysis: outcome.report,
      documentText: document.text,
      title: 'Your document',
      blurb: 'Analysed just now. This report is not saved anywhere.',
    });

    putReport(outcome.report.reportId, view, Date.now());

    // Counts and durations, never content. The report id is left out too: it is the
    // URL of a document somebody is reading, and a log line should not be a way to
    // find one.
    analysisLog.analysisCompleted({
      documentType: outcome.report.documentType,
      findingCount: outcome.report.grounding.total,
      groundedCount: outcome.report.grounding.grounded,
      rejectedCount: outcome.report.grounding.rejected,
      durationMs: Date.now() - startedAt,
      model: answeredBy,
      degraded,
    });

    return redirect(withLanguage(`/report/${outcome.report.reportId}`, language));
  } catch (error) {
    analysisLog.analysisFailed({ reason: reasonFor(error), durationMs: Date.now() - startedAt });
    return redirect(backToForm(messageFor(error), 'error', language));
  }
}

/**
 * Read whichever of the two inputs was supplied.
 *
 * An uploaded file wins over pasted text when both arrive, because a browser that
 * sends both is sending a stale textarea alongside a deliberate choice.
 */
async function extract(form: FormData): Promise<RawExtraction> {
  // The field name is the form's, not this handler's choosing: PasteForm posts
  // `documentFile`, and reading anything else silently discarded every upload and fell
  // through to the empty-paste path.
  const file = form.get('documentFile');
  if (file instanceof File && file.size > 0) {
    return detectAndExtract({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
    });
  }

  const text = readField(form, 'documentText');
  return detectAndExtract({ text: text ?? '' });
}

/**
 * Send the reader back to the form with the reason, not back to the gate.
 *
 * `understood=1` is carried through deliberately: they acknowledged the disclaimer to
 * get here, and making them do it again to read an error message would be a second
 * punishment for a failed upload.
 */
function backToForm(reason: string, key: 'refused' | 'error', language: OutputLanguage): string {
  return withLanguage(`/?understood=1&${key}=${encodeURIComponent(reason)}`, language);
}

/**
 * Redirect to a path, never to a reconstructed absolute URL.
 *
 * `Response.redirect` demands an absolute URL, and the obvious way to build one is
 * `new URL(target, request.url)`. Behind Cloud Run that is wrong: the container is
 * addressed internally, so `request.url` reads `http://0.0.0.0:8080/analyze` and every
 * successful analysis redirected the browser to a host it could not reach. It worked
 * perfectly in local testing, where the two addresses happen to be the same.
 *
 * A relative `Location` is explicitly permitted (RFC 7231 §7.1.2) and every browser
 * resolves it against the address the user actually requested — so the correct host is
 * whatever they typed, and no proxy header has to be trusted or parsed.
 */
function redirect(target: string): Response {
  return new Response(null, { status: 303, headers: { location: target } });
}

/**
 * The refusal, in plain text with the wait attached.
 *
 * Not a redirect back to the form like the other failures: this answer is produced
 * before the body has been read, so the form's language is unknown, and sending the
 * browser back to a form is an invitation to post the document again. `Retry-After`
 * carries the real figure from the bucket rather than a round number, because a client
 * that honours it should be told the truth and one that ignores it gains nothing.
 *
 * The sample documents are the point of the message. They are complete worked
 * analyses served from `golden/`, cost no quota, and work while this endpoint will
 * not — so the suggestion is a way through rather than an apology.
 */
function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    'Too many analyses from this connection.\n\n' +
      `Please try again in ${String(retryAfterSeconds)} seconds. The sample documents on ` +
      'the home page are complete worked analyses that cost no quota, so they work right ' +
      'now.\n',
    {
      status: 429,
      headers: {
        'retry-after': String(retryAfterSeconds),
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}

/**
 * Turn a failure into something a person can act on.
 *
 * An ingest failure already knows what went wrong and says so. A quota failure is the
 * one worth naming precisely, because the reader's next move — open a sample document,
 * which costs no quota — is different from the one they would make on a real error.
 */
function messageFor(error: unknown): string {
  if (error instanceof IngestError) return error.message;
  if (error instanceof GenAiError && error.failure === 'rate_limited') {
    return 'Analysis is rate limited right now. The sample documents are fully worked and need no quota.';
  }
  return 'Something went wrong analysing that document. Please try again.';
}

/**
 * The same failure, as the label the log line is allowed to carry.
 *
 * Separate from `messageFor` because the two answer different questions: that one is
 * read by the person who uploaded the document, this one by whoever is on call. An
 * error's own message is not usable here — an ingest failure can name a file and a
 * model error can quote the payload that provoked it, and neither belongs in a log.
 */
function reasonFor(error: unknown): FailureReason {
  if (error instanceof IngestError) return 'ingest';
  if (error instanceof GenAiError) return error.failure === 'rate_limited' ? 'quota' : 'model';
  return 'unknown';
}


