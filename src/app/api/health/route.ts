import { MODELS } from '@/server/genai/models';
import { loadKnowledge } from '@/server/knowledge/repository';
import { sampleCount } from '@/server/samples/repository';

/**
 * `GET /api/health` — is this deployment actually able to do anything?
 *
 * It exists because of one specific failure mode. Next's `output: 'standalone'` copies
 * the compiled server and nothing else: `data/` and `golden/` are NOT included unless
 * the Dockerfile copies them explicitly. A container missing them starts cleanly,
 * renders every page, and holds zero legal rules — so a document scores zero, no
 * enforceability verdict ever fires, and every sample link 404s. Nothing about that is
 * visible from the outside except by trying it.
 *
 * So this reports configuration, as counts, and one curl makes the whole thing plain.
 *
 * It deliberately does NOT call the model. Free-tier quota is twenty requests per day
 * per model per key; an uptime check that spent one on every probe would exhaust the
 * project's entire budget by lunchtime and turn monitoring into the outage.
 *
 * No key value ever appears here, not even truncated. A prefix identifies which key
 * was used and a suffix narrows a brute force, and a health endpoint is public.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const problems: string[] = [];

  let rubricRules = 0;
  let enforceabilityRows = 0;
  let forums = 0;
  let limitationRules = 0;
  try {
    const knowledge = loadKnowledge();
    rubricRules = knowledge.rubric.rules.length;
    enforceabilityRows = knowledge.enforceability.length;
    forums = knowledge.forums.length;
    limitationRules = knowledge.limitation.length;
    if (rubricRules === 0)
      problems.push('the rubric holds no rules; every document would score 0.');
  } catch (error) {
    problems.push(`data/ did not load: ${describe(error)}`);
  }

  let samples = 0;
  try {
    samples = sampleCount();
    if (samples === 0) problems.push('golden/reports holds no samples; the demo path will 404.');
  } catch (error) {
    problems.push(`golden/ did not load: ${describe(error)}`);
  }

  // Imported here rather than at the top of the module, and called inside the try:
  // `getGeminiKeys` throws when nothing is configured, and a health endpoint that
  // cannot start because the thing it reports on is broken reports nothing.
  let geminiKeys = 0;
  try {
    const { getGeminiKeys } = await import('@/server/config/env');
    geminiKeys = getGeminiKeys().length;
  } catch (error) {
    problems.push(`no usable Gemini key: ${describe(error)}`);
  }

  const ok = problems.length === 0;

  return Response.json(
    {
      ok,
      rubricRules,
      enforceabilityRows,
      forums,
      limitationRules,
      samples,
      geminiKeys,
      model: MODELS.reasoning,
      ...(ok ? {} : { problems }),
    },
    {
      // 503 rather than 200-with-a-flag, so an orchestrator's probe and a human's curl
      // agree about whether this container should be taking traffic.
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

/**
 * The message only. A stack trace in a public response body describes the filesystem
 * of the host to anyone who asks.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
