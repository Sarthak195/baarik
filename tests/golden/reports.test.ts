import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { AnalysisOutcome } from '@/core/report/types';
import { loadKnowledge } from '@/server/knowledge/repository';
import { analyseDocument } from '@/server/pipeline/analyse-document';
import { fixtureDocument, GOLDEN_ANALYSIS_OPTIONS } from '@/server/samples/fixtures';
import { GOLDEN_CLOCK, goldenReportPath, withStableTimings } from '@/server/samples/golden';
import { listSampleIds, loadSample } from '@/server/samples/repository';

import { replayGolden, type FakeLlmGateway } from '../fakes/llm-gateway';

/**
 * The test the README's central claim rests on.
 *
 * Everything else in this suite verifies one component against hand-written input. This
 * runs the real orchestration — classification, fact extraction, clause finding,
 * grounding verification, risk scoring, enforceability triage, consistency detection
 * and remedy routing — over the committed fixtures, with the recorded model output
 * replayed in place of the network, and asserts the result is the report committed
 * under `golden/reports/`.
 *
 * That is what makes those files evidence rather than decoration: they are served
 * verbatim to every evaluator who clicks "try a sample", and nothing but this test
 * establishes that the code still produces them. A change to a rubric weight, a
 * grounding threshold, a limitation rule or an offset calculation shows up here as a
 * diff against seven reports someone can read.
 *
 * The assertion is deliberately whole-report. Two things in a report cannot be
 * reproduced — wall-clock stage timings and the instant of generation — and the
 * recorder already neutralises both (`withStableTimings` zeroes the timings,
 * `GOLDEN_CLOCK` fixes the date), so there is nothing left that a comparison needs to
 * excuse. If a field ever does drift, that is a determinism bug to fix in the pipeline,
 * not a field to exclude from the comparison.
 */

const ids = listSampleIds();

/** The receipt. Its whole purpose is to be refused before any money is spent on it. */
const REFUSAL = 'grocery-bill';

interface Replay {
  readonly outcome: AnalysisOutcome;
  readonly gateway: FakeLlmGateway;
}

/**
 * One fixture, through the real pipeline.
 *
 * The document is built by `fixtureDocument`, the same function the recorder used,
 * because every character offset in a committed report indexes into the string it
 * returns. Canonicalising a second way here — even a whitespace apart — would move
 * every citation in every golden file and the failure would look like a grounding bug.
 */
async function replay(id: string): Promise<Replay> {
  const knowledge = loadKnowledge();
  const gateway = replayGolden(id);

  const outcome = await analyseDocument(
    {
      document: fixtureDocument(id),
      options: GOLDEN_ANALYSIS_OPTIONS,
      forums: knowledge.forums,
      limitation: knowledge.limitation,
      reportId: id,
    },
    {
      llm: gateway,
      knowledge: knowledge.rubric,
      enforceability: knowledge.enforceability,
      clock: GOLDEN_CLOCK,
    },
  );

  return { outcome, gateway };
}

/** The committed file itself, unvalidated, so a stray extra field cannot hide. */
function committed(id: string): unknown {
  const value: unknown = JSON.parse(readFileSync(goldenReportPath(id), 'utf8'));
  return value;
}

/**
 * A fresh outcome in the shape the recorder would have written it to disk.
 *
 * The JSON round trip is not cosmetic: it is the same serialisation `writeGoldenPair`
 * performs, so the comparison is against what is committed rather than against an
 * in-memory value that merely resembles it.
 */
function asCommitted(outcome: AnalysisOutcome): unknown {
  const stable =
    outcome.kind === 'report'
      ? { kind: 'report', report: withStableTimings(outcome.report) }
      : outcome;
  const value: unknown = JSON.parse(JSON.stringify(stable));
  return value;
}

describe('the committed golden reports', () => {
  it('has samples to check, so an empty golden/ cannot pass as a green suite', () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain(REFUSAL);
  });

  for (const id of ids) {
    it(`reproduces ${id} exactly by replaying the recorded model output`, async () => {
      const { outcome, gateway } = await replay(id);

      expect(asCommitted(outcome)).toEqual(committed(id));

      // The stages are asserted alongside the report because the same output can be
      // reached wastefully. What the pipeline claims — classify, then the two
      // extraction calls concurrently, and nothing else — has to be what it does.
      expect(gateway.stagesCalled).toEqual(
        outcome.kind === 'report' ? ['classification', 'facts', 'findings'] : ['classification'],
      );
    });
  }
});

describe('the refusal', () => {
  it('declines a supermarket receipt after one call and never reaches extraction', async () => {
    const { outcome, gateway } = await replay(REFUSAL);

    expect(outcome.kind).toBe('not_a_document');
    // The point is the call that did NOT happen. Extraction is the expensive pair, and
    // spending it to confirm that a grocery bill has no notice period would burn a
    // tenth of a day's free-tier quota on a question already answered.
    expect(gateway.stagesCalled).toEqual(['classification']);
    expect(gateway.stagesCalled).not.toContain('facts');
    expect(gateway.stagesCalled).not.toContain('findings');
  });
});

/**
 * The claim the whole product rests on: every sentence shown to a reader as something
 * their contract says is something their contract actually says.
 *
 * Asserted across all committed reports at once rather than per fixture, because it is
 * a property of the output the demo serves rather than of any one document. A model
 * paraphrasing a clause instead of quoting it does not fail loudly anywhere else — the
 * finding is simply dropped — so a recording that started doing so would quietly
 * shrink the reports and nothing but this would say it had happened.
 */
describe('grounding', () => {
  it('grounds every finding in every golden report, with none rejected', () => {
    const reports = ids
      .map((id) => ({ id, outcome: loadSample(id) }))
      .filter((sample) => sample.outcome?.kind === 'report');

    expect(reports.length).toBeGreaterThan(0);

    for (const { id, outcome } of reports) {
      if (outcome?.kind !== 'report') continue;
      const { findings, rejected, grounding } = outcome.report;

      expect({ id, rejected: grounding.rejected }).toEqual({ id, rejected: 0 });
      expect({ id, grounded: grounding.grounded }).toEqual({ id, grounded: grounding.total });
      expect({ id, kept: findings.length }).toEqual({ id, kept: grounding.total });
      expect({ id, dropped: rejected.length }).toEqual({ id, dropped: 0 });
      // Not vacuous: a report with no findings would satisfy every line above.
      expect({ id, total: grounding.total > 0 }).toEqual({ id, total: true });
    }
  });
});
