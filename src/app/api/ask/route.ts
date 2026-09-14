import { createHash, randomUUID } from 'node:crypto';

import type { AnswerView, AskError } from '@/components/qa/types';
import type { CanonicalDocument } from '@/core/document/types';
import { parseLanguage, withLanguage } from '@/i18n';
import { sampleReportView } from '@/server/samples/view';
import type { OutputLanguage } from '@/schemas/document-type';
import { getGeminiKeyPool } from '@/server/config/env';
import { LIMITS } from '@/server/config/limits';
import { GenAiError } from '@/server/genai/errors';
import { callWithFallback } from '@/server/genai/gateway';
import { loadKnowledge } from '@/server/knowledge/repository';
import { analysisLog } from '@/server/observability/analysis-log';
import type { FailureReason } from '@/server/observability/logger';
import { answerQuestion, type LlmGateway } from '@/server/pipeline/stages';
import { malformedBody, readField, readForm } from '@/lib/form-field';
import { checkRateLimit } from '@/server/ratelimit/token-bucket';
import { getReport } from '@/server/store/report-store';
import { putAnswer } from './answer-store';
import { verifyAnswer } from './verify-answer';

/**
 * `POST /api/ask` — a question about one already-analysed document.
 *
 * Form-encoded and answered with a redirect, exactly like `/analyze`, so the question
 * box needs no JavaScript. This is a plain POST rather than a Server Action for the
 * same reason: a Server Action degrades to one only because the framework arranges it,
 * and "works with scripting off" should not be a property somebody can regress by
 * changing a build setting.
 *
 * The answer is stored under an opaque token and the browser is sent to
 * `/report/<id>?answered=<token>#ask` rather than being handed the answer inline. Two
 * reasons, in order of weight:
 *
 *   1. **The URL must not carry the document.** An answer quotes a passage of a
 *      contract and follows a question that may be about a salary, a deposit or a
 *      medical clause. URLs reach browser history, `Referer` headers and proxy logs.
 *      `logger.ts` will not let a quote into a log line; posting the same text into a
 *      query string would make that discipline decorative.
 *
 *   2. **The report page already exists.** Rendering the answer from this handler
 *      would mean emitting HTML with no layout, no stylesheet and no site chrome —
 *      accessibility and legibility thrown away to save a round trip. Redirecting
 *      means the answer appears inside the page it belongs to, and a reload re-renders
 *      it without spending a second request of metered quota.
 */

/** One model call, not a whole pipeline — but a reasoning model is still not quick. */
export const maxDuration = 120;

/** A live report id is a UUID; a sample's is a slug. Neither contains anything else. */
const REPORT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  // First statement, before the body is read. This endpoint spends the same metered
  // quota `/analyze` does — free-tier Gemini allows twenty requests per model per key
  // per day — and a limiter that runs after the model call protects nothing.
  const decision = checkRateLimit(request.headers, startedAt);
  if (!decision.allowed) return tooManyRequests(decision.retryAfterSeconds);

  // `formData()` throws on a body whose content type it cannot parse. A browser always
  // sends the right one, so reaching this is a hand-crafted request — but an uncaught
  // throw here is a 500, which says the server broke when in fact the request did.
  const form = await readForm(request);
  if (form === null) return malformedBody();
  const language = parseLanguage(readField(form, 'lang'));
  const reportId = readField(form, 'reportId') ?? '';
  const question = (readField(form, 'question') ?? '').trim();

  // The id is echoed into a `Location` header, so it is validated before it is used
  // rather than after. A shape check here is also what stops a newline reaching the
  // header at all.
  if (!REPORT_ID.test(reportId)) {
    return plain(400, 'Ask about a report by posting its id: reportId, question, lang.');
  }

  const documentText = documentFor(reportId);

  // The store is memory only and per-instance, so a report can be genuinely gone — a
  // restart, thirty minutes, or a second Cloud Run container. Rather than inventing a
  // second explanation of that here, the reader is sent to the report page, which owns
  // the "no longer available" wording and the offer of a sample that costs no quota.
  if (documentText === null) return redirect(withLanguage(`/report/${reportId}`, language));

  if (question.length === 0) return refused(reportId, language, 'empty');
  // Truncating silently would be worse than refusing: the reader would be answered on
  // a question they did not ask.
  if (question.length > LIMITS.maxQuestionChars) return refused(reportId, language, 'too_long');

  try {
    const view = await ask(documentText, question, language);
    const token = randomUUID();
    putAnswer(token, reportId, view, Date.now());
    return redirect(anchored(`/report/${reportId}?answered=${token}`, language));
  } catch (error) {
    // Scalars only, and no field on this line can hold a question or a quote. It is
    // `analysisFailed` rather than a new event because the actionable content is
    // identical — which subsystem broke — and the alternative was widening the
    // logger's allowlist to describe a path that has nothing new to say.
    analysisLog.analysisFailed({ reason: reasonFor(error), durationMs: Date.now() - startedAt });
    return refused(reportId, language, 'unavailable');
  }
}

/**
 * Ask the model, then check what it said against the document.
 *
 * The verification is the point of the function. `answerQuestion` returns an assertion;
 * `verifyAnswer` decides whether that assertion may be shown as a citation.
 */
async function ask(
  documentText: string,
  question: string,
  language: OutputLanguage,
): Promise<AnswerView> {
  // Resolved here rather than at module scope: `next build` evaluates route modules to
  // collect page data, and a build machine holds no credentials.
  const keys = getGeminiKeyPool();

  // No exhaustion memory is built here: `genai/exhaustion.ts` holds one for the whole
  // process, so a question inherits what the analysis before it learned about which
  // (model, key) pairs are spent rather than rediscovering it one 429 at a time.
  const llm: LlmGateway = {
    structured: (req) => callWithFallback(req, { keys, now: Date.now() }),
  };

  // The Q&A stage reads only `llm`, but `PipelineDeps` is one object by design and
  // `loadKnowledge` is memoised process-wide, so supplying the rest costs a map lookup.
  const knowledge = loadKnowledge();

  const answer = await answerQuestion(canonical(documentText), question, language, {
    llm,
    knowledge: knowledge.rubric,
    enforceability: knowledge.enforceability,
    clock: () => new Date(),
  });

  return { question, outcome: verifyAnswer(answer, documentText) };
}

/**
 * The stored report's text, whether it came from a live analysis or from a fixture.
 *
 * Both are offered because both are documents a reader is looking at: refusing to
 * answer questions about a sample would make the capability invisible to anyone
 * evaluating the product without uploading a contract of their own.
 */
function documentFor(reportId: string): string | null {
  const report = getReport(reportId, Date.now()) ?? sampleReportView(reportId);
  return report === null ? null : report.documentText;
}

/**
 * The report text as the pipeline expects it, without putting it back through
 * `toCanonicalDocument`.
 *
 * Re-canonicalising already-canonical text risks shifting it by a character, and every
 * offset on the page — each clause card's highlight, each span in the source section —
 * indexes into the string as stored. The quote this route locates has to be findable
 * in the same string the reader can see, so that string is used unchanged. Pages and
 * segments are empty because the Q&A stage reads neither; it sends the text and
 * nothing else.
 */
function canonical(text: string): CanonicalDocument {
  return {
    text,
    pages: [],
    segments: [],
    hash: createHash('sha256').update(text).digest('hex'),
    truncated: false,
  };
}

/** Back to the report with the reason, as a code rather than as a sentence. */
function refused(reportId: string, language: OutputLanguage, error: AskError): Response {
  return redirect(anchored(`/report/${reportId}?askError=${error}`, language));
}

/**
 * The fragment goes on last, after `withLanguage` has had its say — a query parameter
 * appended after a `#` would become part of the fragment and never reach the server.
 */
function anchored(path: string, language: OutputLanguage): string {
  return `${withLanguage(path, language)}#ask`;
}

/**
 * A relative `Location`, never a URL rebuilt from `request.url`.
 *
 * Behind Cloud Run the container is addressed internally, so `request.url` reads
 * `http://0.0.0.0:8080/...` and the browser is sent to a host it cannot reach. It
 * looks correct in local testing, where the two addresses are the same. A relative
 * target is permitted (RFC 7231 §7.1.2), resolves against whatever the reader actually
 * typed, and requires no proxy header to be trusted.
 */
function redirect(target: string): Response {
  return new Response(null, { status: 303, headers: { location: target } });
}

/** Refused before the body was read, so there is no language to answer in yet. */
function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    'Too many questions from this connection.\n\n' +
      `Please try again in ${String(retryAfterSeconds)} seconds. Answering a question ` +
      'spends the same metered quota as an analysis.\n',
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

/** Read by a person with curl rather than by the form, which posts a valid id. */
function plain(status: number, message: string): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * An error's own message is untrusted text — a model error can quote the payload that
 * provoked it, and that payload is the document. Only a label from a closed set is
 * allowed anywhere near a log line.
 */
function reasonFor(error: unknown): FailureReason {
  if (error instanceof GenAiError) return error.failure === 'rate_limited' ? 'quota' : 'model';
  return 'unknown';
}

