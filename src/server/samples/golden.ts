import 'server-only';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import type { AnalysisOutcome, AnalysisReport } from '../../core/report/types';

/**
 * The layout of `golden/`, in one module.
 *
 * Two programs care about these paths and they must never disagree:
 * `scripts/record-golden.ts` writes them with a live key, and `repository.ts` reads
 * them on every sample request with no key at all. A recorder that wrote
 * `golden/report/` while the server read `golden/reports/` would fail in the worst
 * possible place — the demo — and pass every test.
 *
 *   golden/llm/<id>.json      recorded model output per stage, replayed by the fake
 *                             gateway so CI exercises the whole pipeline offline
 *   golden/reports/<id>.json  the finished AnalysisOutcome, served by /api/sample
 */

/**
 * The instant every golden file is recorded at.
 *
 * Injected as the pipeline's clock so `meta.generatedAt` and any limitation deadline
 * are properties of the recording rather than of the day it happened to run. Without
 * it, re-recording one fixture would rewrite the dates in all of them.
 */
export const GOLDEN_CLOCK = (): Date => new Date('2026-09-13T00:00:00Z');

export function goldenReportsDir(root: string = process.cwd()): string {
  return join(root, 'golden', 'reports');
}

export function goldenReportPath(id: string, root: string = process.cwd()): string {
  return join(goldenReportsDir(root), `${id}.json`);
}

export function goldenLlmPath(id: string, root: string = process.cwd()): string {
  return join(root, 'golden', 'llm', `${id}.json`);
}

/**
 * Write a golden file the same way every time.
 *
 * Two-space JSON with a trailing newline and LF endings, which is what makes a
 * re-recording a diff of what the model said rather than a diff of formatting.
 * `.gitattributes` marks `golden/**` as binary so no checkout rewrites the endings,
 * and `.prettierrc.json` requires a pragma there so no formatter reflows them.
 */
export function writeGoldenJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** The pipeline stages a recording covers, in the order they are written. */
export const GOLDEN_STAGES = ['classification', 'facts', 'findings'] as const;
export type GoldenStage = (typeof GOLDEN_STAGES)[number];

/** One stage's validated model output, with the model that actually answered. */
export interface StageRecording {
  readonly model: string;
  readonly value: unknown;
}

/**
 * Write both artefacts for one fixture.
 *
 * They are written together because they are only meaningful together: a report
 * without its recording cannot be reproduced by the test suite, and a recording
 * without its report proves nothing about the pipeline. A refused document records
 * only the classification stage, because the pipeline never reached the other two.
 */
export function writeGoldenPair(
  id: string,
  outcome: AnalysisOutcome,
  stages: ReadonlyMap<GoldenStage, StageRecording>,
  root: string = process.cwd(),
): void {
  const models: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  // Fixed key order, so a re-recording that changes nothing produces no diff.
  for (const stage of GOLDEN_STAGES) {
    const recording = stages.get(stage);
    if (recording === undefined) continue;
    models[stage] = recording.model;
    values[stage] = recording.value;
  }

  writeGoldenJson(goldenLlmPath(id, root), {
    fixtureId: id,
    recordedAt: GOLDEN_CLOCK().toISOString(),
    models,
    // Exactly what each stage's schema validated, so a fake gateway replays the value
    // verbatim rather than reconstructing it.
    stages: values,
  });

  writeGoldenJson(
    goldenReportPath(id, root),
    outcome.kind === 'report'
      ? { kind: 'report', report: withStableTimings(outcome.report) }
      : outcome,
  );
}

/**
 * A recording, as read back.
 *
 * The stage values are `unknown` on purpose: each one is replayed through the stage's
 * own Zod schema by whoever consumes it, so a recording that has drifted from the
 * schema fails in the same place a live model response would. Typing them here would
 * assert a shape nobody has checked.
 */
const RecordingSchema = z.object({
  fixtureId: z.string().min(1),
  recordedAt: z.string().min(1),
  models: z.record(z.string(), z.string()),
  // `partialRecord`, not `record`: an enum-keyed record in Zod 4 is exhaustive, and a
  // refused document records one stage. The exhaustive form would silently invent the
  // other two as `undefined`, which a replaying fake would hand to the pipeline.
  stages: z.partialRecord(z.enum(GOLDEN_STAGES), z.unknown()),
});

export type GoldenRecording = z.infer<typeof RecordingSchema>;

/**
 * Read the model output recorded for one fixture, or null when there is none.
 *
 * This is the offline half of the pipeline: a fake gateway resolves a request to a
 * stage and returns `stages[stage]` verbatim, which is how CI exercises the whole
 * orchestration with no API key and no network.
 *
 * @throws when the file exists but is not a recording. A silently empty replay would
 *   make a golden-report test fail somewhere far from the actual cause.
 */
export function readGoldenRecording(
  id: string,
  root: string = process.cwd(),
): GoldenRecording | null {
  const path = goldenLlmPath(id, root);
  if (!existsSync(path)) return null;

  const parsed = RecordingSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `${path} is not a valid recording: ${parsed.error.issues[0]?.message ?? 'unknown reason'}. ` +
        'Re-record it rather than editing it by hand.',
    );
  }
  return parsed.data;
}

/**
 * Zero the stage timings before a report is committed.
 *
 * Wall-clock measurements are the one part of a report that cannot be reproduced, so
 * committing them would churn every golden file on every re-recording while carrying
 * no information. Zero is also the honest figure for a sample: serving one from disk
 * spends no model time at all.
 */
export function withStableTimings(report: AnalysisReport): AnalysisReport {
  const stageTimingsMs = Object.fromEntries(
    Object.keys(report.meta.stageTimingsMs)
      .sort()
      .map((stage) => [stage, 0]),
  );
  return { ...report, meta: { ...report.meta, stageTimingsMs } };
}
