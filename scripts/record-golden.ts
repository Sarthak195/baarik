/**
 * Record the committed golden analyses — `npm run record:golden`.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/record-golden.ts [--only <id>] [--force]
 *
 * Free-tier Gemini quota is twenty requests per day, per model, per key, and one
 * analysis spends two. That single fact shapes everything here. What this script writes
 * is what lets the product demo itself, and CI test itself, without spending any of
 * that budget again: `golden/llm/*.json` replays through a fake gateway, and
 * `golden/reports/*.json` is served directly by `/api/sample`.
 *
 * So the run is frugal and resumable: a fixture with both artefacts is skipped unless
 * `--force`, an unrecognised argument records nothing, and a 429 stops with a list of
 * what remains rather than rediscovering the same limit six more times.
 *
 * Nothing here prints document text, a quote or an extracted fact. Progress is counts.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { z } from 'zod';

import type { AnalysisOutcome } from '../src/core/report/types';
import { GenAiError } from '../src/server/genai/errors';
import { callWithFallback } from '../src/server/genai/gateway';
import type { StructuredRequest } from '../src/server/genai/interactions';
import { loadKnowledge } from '../src/server/knowledge/repository';
import { analyseDocument } from '../src/server/pipeline/analyse-document';
import type { LlmGateway } from '../src/server/pipeline/stages';
import { CLASSIFY_DOCUMENT_SYSTEM } from '../src/server/prompts/classify-document';
import { EXTRACT_FACTS_SYSTEM } from '../src/server/prompts/extract-facts';
import { FIND_CLAUSES_SYSTEM } from '../src/server/prompts/find-clauses';
import {
  fixtureDocument,
  fixtureExists,
  fixtureIds,
  GOLDEN_ANALYSIS_OPTIONS,
} from '../src/server/samples/fixtures';
import {
  GOLDEN_CLOCK,
  goldenLlmPath,
  goldenReportPath,
  writeGoldenPair,
  type GoldenStage,
  type StageRecording,
} from '../src/server/samples/golden';

/**
 * Load `.env` without a dependency: dotenv is not worth adding for six lines that run
 * on a developer's machine. The real environment always wins, so a deployment's
 * injected secret cannot be shadowed by a stale file.
 */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    const name = match?.[1];
    const value = match?.[2];
    if (name === undefined || value === undefined) continue;
    process.env[name] ??= value.replace(/^(["'])(.*)\1$/, '$2');
  }
}

/**
 * Which stage a request belongs to. The system instruction is the one part of a request
 * that is constant per stage, so it is the key a replaying fake can match on.
 */
function stageOf(system: string): GoldenStage | null {
  if (system === CLASSIFY_DOCUMENT_SYSTEM) return 'classification';
  if (system === EXTRACT_FACTS_SYSTEM) return 'facts';
  if (system === FIND_CLAUSES_SYSTEM) return 'findings';
  return null;
}

async function main(): Promise<void> {
  loadDotEnv('.env');

  // Imported here rather than at the top: the module validates the environment as it
  // loads and throws when no key is configured, which must happen after `.env` is read.
  const { geminiKeyPool } = await import('../src/server/config/env');

  const request = parseArgs(process.argv.slice(2));
  if (request === null) return;
  const { requested, force } = request;

  const knowledge = loadKnowledge();
  // Shared across fixtures: one (model, key) pair discovered exhausted stays known for
  // the whole run instead of being rediscovered a 429 at a time.
  const exhausted = new Set<string>();
  let recorded = 0;

  for (const [index, id] of requested.entries()) {
    const label = `[${String(index + 1)}/${String(requested.length)}] ${id}`;

    if (!force && existsSync(goldenReportPath(id)) && existsSync(goldenLlmPath(id))) {
      console.log(`${label} — already recorded, skipping (pass --force to re-record)`);
      continue;
    }

    const stages = new Map<GoldenStage, StageRecording>();
    const llm: LlmGateway = {
      // `callWithFallback` rather than a bare call, so recording benefits from the same
      // (model x key) ladder the product uses: a 429 costs a substitution, not a fixture.
      async structured<TSchema extends z.ZodType>(request_: StructuredRequest<TSchema>) {
        const result = await callWithFallback(request_, { keys: geminiKeyPool, exhausted });
        const stage = stageOf(request_.system);
        if (stage !== null) stages.set(stage, { model: result.model, value: result.value });
        return { value: result.value, model: result.model, cachedTokens: result.cachedTokens };
      },
    };

    console.log(`${label} — calling the model…`);
    try {
      const outcome = await analyseDocument(
        {
          document: fixtureDocument(id),
          options: GOLDEN_ANALYSIS_OPTIONS,
          forums: knowledge.forums,
          limitation: knowledge.limitation,
          reportId: id,
        },
        {
          llm,
          knowledge: knowledge.rubric,
          enforceability: knowledge.enforceability,
          clock: GOLDEN_CLOCK,
        },
      );

      writeGoldenPair(id, outcome, stages);
      recorded += 1;
      console.log(`${label} — ${describe(outcome)}`);
    } catch (error) {
      reportFailure(error, requested.slice(index));
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `\nRecorded ${String(recorded)} of ${String(requested.length)} requested fixture(s). ` +
      'Commit golden/ — the demo and the test suite read it instead of the API.',
  );
}

/**
 * Strict, because the cost of a typo here is the day's quota. An unrecognised argument
 * must not fall through to "record everything": on a free tier that spends twenty
 * requests before anyone has read the output.
 */
function parseArgs(
  args: readonly string[],
): { requested: readonly string[]; force: boolean } | null {
  let force = false;
  const only: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg !== '--only') {
      return usage(arg === '--help' || arg === '-h' ? null : `Unrecognised argument: ${arg ?? ''}`);
    }

    const id = args[index + 1];
    index += 1;
    if (id === undefined || !fixtureExists(id)) {
      return usage(`--only needs one fixture id. Known: ${fixtureIds().join(', ')}`);
    }
    only.push(id);
  }

  return { requested: only.length > 0 ? only : fixtureIds(), force };
}

function usage(problem: string | null): null {
  const text =
    'Usage: npm run record:golden -- [--only <fixture-id>] [--force]\n\n' +
    'Records every fixture with no golden files yet; --force re-records one that has.\n' +
    `Fixtures: ${fixtureIds().join(', ')}\n\n` +
    'Needs a live Gemini key in .env. Each document spends two requests against a free\n' +
    'tier of twenty per day per model per key, so the run is resumable by design.';

  if (problem === null) console.log(text);
  else console.error(`${problem}\n\n${text}`);
  process.exitCode = problem === null ? 0 : 1;
  return null;
}

/** Counts only. A progress line that quoted a clause would put contract text in a log. */
function describe(outcome: AnalysisOutcome): string {
  if (outcome.kind === 'not_a_document') return 'recorded the refusal (not a legal document)';
  const { risk, findings, rejected, enforceability, nextSteps } = outcome.report;
  const counts = [findings.length, rejected.length, enforceability.length, nextSteps.length];
  return (
    `recorded — risk ${String(risk.score)} (${risk.band}); ` +
    `${counts.map(String).join('/')} findings/rejected/verdicts/next-steps`
  );
}

/**
 * A quota failure is expected, not exceptional: it is the reason this script is
 * resumable. It gets a plain message naming what is left, so tomorrow's run is one
 * command rather than a diff against the directory.
 */
function reportFailure(error: unknown, remaining: readonly string[]): void {
  const quota = error instanceof GenAiError && error.failure === 'rate_limited';
  console.error(
    (quota
      ? '\nEvery model and key combination is exhausted for today. Stopping here rather ' +
        'than spending what is left discovering the same limit again.'
      : `\nRecording failed: ${error instanceof Error ? error.message : 'unknown error'}`) +
      `\nNot recorded: ${remaining.join(', ')}` +
      `\nResume with:  npm run record:golden -- --only ${remaining[0] ?? '<id>'}` +
      '\nEverything already written under golden/ is complete and committable.',
  );
}

// Not top-level `await`: tsx transforms a script in a CommonJS package to CJS, where
// top-level await is a syntax error. The rejection handler keeps an unexpected failure
// a message rather than an unhandled-rejection stack trace.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recording failed unexpectedly.');
  process.exitCode = 1;
});
