import { randomUUID, createHash } from 'node:crypto';

import { toCanonicalDocument } from '@/core/document/normalise';
import type { RawExtraction } from '@/core/document/types';
import { parseLanguage, withLanguage } from '@/i18n';
import { toReportView } from '@/lib/report-view';
import { geminiKeyPool } from '@/server/config/env';
import { LIMITS } from '@/server/config/limits';
import { GenAiError } from '@/server/genai/errors';
import { callWithFallback } from '@/server/genai/gateway';
import { detectAndExtract, IngestError } from '@/server/ingest/detect';
import { loadKnowledge } from '@/server/knowledge/repository';
import { analyseDocument } from '@/server/pipeline/analyse-document';
import type { LlmGateway } from '@/server/pipeline/stages';
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
  const form = await request.formData();
  const language = parseLanguage(readField(form, 'lang'));

  try {
    const raw = await extract(form);
    const hash = createHash('sha256').update(raw.text).digest('hex');
    const document = toCanonicalDocument(raw, hash);
    const knowledge = loadKnowledge();

    // The gateway is the LlmGateway, so every stage inherits the (model, key) ladder:
    // a stage that meets a daily quota substitutes a model rather than failing the
    // whole analysis. The exhausted set is per-request here; sharing it process-wide
    // belongs with the analysis cache and is a later change.
    const exhausted = new Set<string>();
    const llm: LlmGateway = {
      structured: (req) => callWithFallback(req, { keys: geminiKeyPool, exhausted }),
    };

    const outcome = await analyseDocument(
      {
        document,
        options: { language, readingLevel: 'standard', maxFindings: LIMITS.maxFindings },
        forums: knowledge.forums,
        limitation: knowledge.limitation,
        reportId: randomUUID(),
        readAsScan: !raw.offsetsReliable,
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
      return redirect(request, withLanguage(`/?refused=${encodeURIComponent(outcome.reason)}`, language));
    }

    const view = toReportView({
      analysis: outcome.report,
      documentText: document.text,
      title: 'Your document',
      blurb: 'Analysed just now. This report is not saved anywhere.',
    });

    putReport(outcome.report.reportId, view, Date.now());
    return redirect(request, withLanguage(`/report/${outcome.report.reportId}`, language));
  } catch (error) {
    return redirect(request, withLanguage(`/?error=${encodeURIComponent(messageFor(error))}`, language));
  }
}

/**
 * Read whichever of the two inputs was supplied.
 *
 * An uploaded file wins over pasted text when both arrive, because a browser that
 * sends both is sending a stale textarea alongside a deliberate choice.
 */
async function extract(form: FormData): Promise<RawExtraction> {
  const file = form.get('document');
  if (file instanceof File && file.size > 0) {
    return detectAndExtract({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
    });
  }

  const text = readField(form, 'documentText');
  return detectAndExtract({ text: text ?? '' });
}

function redirect(request: Request, target: string): Response {
  return Response.redirect(new URL(target, request.url), 303);
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
 * `FormDataEntryValue` is `string | File`, and a `File` where a string was expected
 * means the request was malformed rather than that the field is empty — so it is
 * discarded rather than coerced into the string "[object File]".
 */
function readField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}
