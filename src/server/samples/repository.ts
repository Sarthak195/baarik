import 'server-only';

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import type { AnalysisOutcome } from '../../core/report/types';
import { goldenReportPath, goldenReportsDir } from './golden';
import { parseSampleOutcome } from './report-schema';

/**
 * The zero-cost demo path.
 *
 * Free-tier Gemini quota is twenty requests per day per model per key, and a full
 * analysis spends two of them. An evaluator who opens the "try a sample document"
 * link therefore cannot be served by the pipeline: on judging day the quota is the
 * scarcest resource in the project, and the sample path is the one an evaluator is
 * guaranteed to take. So a sample is read from `golden/reports/`, which was recorded
 * once by `scripts/record-golden.ts` and committed. **Nothing here calls a model.**
 *
 * Each file is validated on load rather than trusted. See `report-schema.ts` for why:
 * a truncated golden file renders as a clean contract, which is the worst output this
 * product can produce.
 *
 * Reads are synchronous and memoised. The files are a few hundred kilobytes in total,
 * they cannot change within a process, and doing it this way keeps the sample route a
 * plain function of its id rather than something with a loading state.
 */

/**
 * Sample ids are fixture basenames and appear in a query string, so they are matched
 * against this before touching the filesystem. `join` happily accepts `../../.env`.
 */
const SAMPLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Keyed by resolved path rather than by id, so a test pointed at a temporary
// directory cannot be served a sample the production root cached earlier.
const cache = new Map<string, AnalysisOutcome>();
const idsByDirectory = new Map<string, readonly string[]>();

/**
 * Every committed sample id, sorted, so a listing and a health count never disagree
 * about what is deployed.
 *
 * A missing directory yields an empty list rather than throwing: `output: 'standalone'`
 * does not copy `golden/` into the image, so its absence is a deployment fact that
 * `/api/health` should report, not an exception that takes the page down with it.
 */
export function listSampleIds(root: string = process.cwd()): readonly string[] {
  const directory = goldenReportsDir(root);
  const known = idsByDirectory.get(directory);
  if (known !== undefined) return known;

  const found = readIds(directory);
  idsByDirectory.set(directory, found);
  return found;
}

function readIds(directory: string): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => SAMPLE_ID.test(id))
    .sort();
}

/**
 * One committed analysis, or null when no sample has that id.
 *
 * The return type is the pipeline's own `AnalysisOutcome`, refusal included, so a
 * caller branches on `kind` exactly as it would for a live document. The grocery-bill
 * sample is a `not_a_document` outcome and is a first-class demo case: it shows the
 * classifier declining to score a supermarket receipt.
 *
 * @throws when the file exists but is not a valid analysis. A corrupt sample must fail
 *   visibly; rendering it as an empty report would tell the reader their contract is
 *   clean.
 */
export function loadSample(id: string, root: string = process.cwd()): AnalysisOutcome | null {
  if (!SAMPLE_ID.test(id)) return null;

  const path = goldenReportPath(id, root);
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  if (!existsSync(path)) return null;

  const outcome = readOutcome(path);
  cache.set(path, outcome);
  return outcome;
}

function readOutcome(path: string): AnalysisOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON. Re-record it with ` +
        `\`npm run record:golden -- --only <id> --force\`.`,
      { cause: error },
    );
  }

  const result = parseSampleOutcome(parsed);
  if (!result.ok) {
    throw new Error(
      `${path} is not a valid analysis: ${result.message}. ` +
        'A golden report is generated, never hand-written — re-record it with ' +
        '`npm run record:golden -- --only <id> --force` rather than patching the file.',
    );
  }
  return result.outcome;
}

/**
 * How many samples this deployment actually holds.
 *
 * Reported by `/api/health` because a container built without `golden/` starts and
 * serves pages perfectly while the one path an evaluator is guaranteed to take 404s.
 */
export function sampleCount(root: string = process.cwd()): number {
  return listSampleIds(root).length;
}

/** Discard the memoised samples. Used by tests; never called in production. */
export function resetSamples(): void {
  cache.clear();
  idsByDirectory.clear();
}
