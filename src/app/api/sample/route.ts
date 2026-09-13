import { listSampleIds, loadSample } from '@/server/samples/repository';

/**
 * `GET /api/sample?id=offer-letter-meridian` — a fully worked analysis, for free.
 *
 * This endpoint calls no model, ever. That is its entire purpose. Free-tier quota is
 * twenty requests per day per model per key and an analysis spends two, so the path an
 * evaluator is most likely to take is the one that must not depend on the API being
 * reachable, funded or unexhausted. Everything served here was recorded once by
 * `scripts/record-golden.ts` and committed under `golden/reports/`.
 *
 * The body is the pipeline's own `AnalysisOutcome`, discriminated on `kind`, so a
 * client renders a sample through exactly the branch it uses for a live document —
 * including `not_a_document`, which is a real sample: the supermarket receipt the
 * classifier declines to score.
 *
 * A corrupt golden file is deliberately NOT caught here. The repository throws with a
 * message naming the file, the framework logs it and answers 500, and the alternative
 * — a 200 carrying an empty report — would tell a reader their contract is clean.
 */
export function GET(request: Request): Response {
  const id = new URL(request.url).searchParams.get('id');

  if (id === null || id.trim().length === 0) {
    return plain(400, `Pass a sample id: /api/sample?id=<id>. Available: ${available()}`);
  }

  const outcome = loadSample(id.trim());
  if (outcome === null) {
    return plain(404, `No sample named "${safe(id)}". Available: ${available()}`);
  }

  return Response.json(outcome, {
    // A sample is immutable for the life of a deployment, so it may be cached hard.
    // On judging day this is the difference between one disk read and hundreds.
    headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}

function available(): string {
  const ids = listSampleIds();
  return ids.length > 0 ? ids.join(', ') : '(none — golden/reports is missing from this deployment)';
}

/**
 * The id is echoed back so a typo is self-diagnosing, but only after being reduced to
 * the character set a real id uses. Reflecting an arbitrary query string into a
 * response body is how a plain-text endpoint becomes someone else's attack surface.
 */
function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
}

/** Plain text, not JSON: this is read by a person with curl, not by the report page. */
function plain(status: number, message: string): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
