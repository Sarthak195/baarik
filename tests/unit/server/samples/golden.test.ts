import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GOLDEN_CLOCK,
  goldenLlmPath,
  goldenReportPath,
  goldenReportsDir,
  readGoldenRecording,
  withStableTimings,
  writeGoldenPair,
  type GoldenStage,
  type StageRecording,
} from '@/server/samples/golden';
import { listSampleIds, loadSample } from '@/server/samples/repository';

import { emptyAnalysisReport } from './empty-report';

/**
 * Golden files are a committed artefact, so their determinism is a property worth
 * testing directly: a recording that churned formatting or timings on every run would
 * make the diff useless, and a diff nobody reads is how a bad recording gets committed.
 */

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'baarik-golden-'));
}

describe('the golden layout', () => {
  it('places both artefacts where the repository reads them', () => {
    const root = tempRoot();

    expect(goldenReportPath('offer', root)).toBe(join(root, 'golden', 'reports', 'offer.json'));
    expect(goldenLlmPath('offer', root)).toBe(join(root, 'golden', 'llm', 'offer.json'));
    expect(goldenReportsDir(root)).toBe(join(root, 'golden', 'reports'));
    expect(goldenReportPath('offer', root).startsWith(goldenReportsDir(root) + sep)).toBe(true);
  });

  it('records at a fixed instant', () => {
    // The whole point: re-recording one fixture must not rewrite the dates in the rest.
    expect(GOLDEN_CLOCK().toISOString()).toBe('2026-09-13T00:00:00.000Z');
    expect(GOLDEN_CLOCK()).not.toBe(GOLDEN_CLOCK());
  });
});

describe('withStableTimings', () => {
  it('zeroes the stage timings and sorts them, leaving everything else alone', () => {
    const report = emptyAnalysisReport();

    const stable = withStableTimings(report);

    expect(stable.meta.stageTimingsMs).toEqual({ classify: 0, extract: 0 });
    expect(Object.keys(stable.meta.stageTimingsMs)).toEqual(['classify', 'extract']);
    expect(stable.meta.generatedAt).toBe(report.meta.generatedAt);
    expect(stable.risk).toEqual(report.risk);
  });

  it('does not mutate the report it was given', () => {
    const report = emptyAnalysisReport();

    withStableTimings(report);

    expect(report.meta.stageTimingsMs).toEqual({ extract: 9137, classify: 812 });
  });
});

describe('writeGoldenPair', () => {
  const stages = new Map<GoldenStage, StageRecording>([
    ['findings', { model: 'gemini-3.8-flash', value: { findings: [] } }],
    ['classification', { model: 'gemini-3.1-flash-lite', value: { isLegalDocument: true } }],
    ['facts', { model: 'gemini-3.8-flash', value: { documentType: 'nda' } }],
  ]);

  it('writes a report and its recording, byte-stably', () => {
    const root = tempRoot();

    writeGoldenPair('offer', { kind: 'report', report: emptyAnalysisReport() }, stages, root);

    const text = readFileSync(goldenReportPath('offer', root), 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    expect(text).toContain('\n  "kind": "report"');

    const written: unknown = JSON.parse(text);
    expect(written).toMatchObject({ kind: 'report', report: { reportId: 'sample' } });
    // Recorded timings never reach the committed file.
    expect(text).not.toContain('9137');
  });

  it('writes the stages in pipeline order rather than insertion order', () => {
    const root = tempRoot();

    writeGoldenPair('offer', { kind: 'report', report: emptyAnalysisReport() }, stages, root);

    const recording: unknown = JSON.parse(readFileSync(goldenLlmPath('offer', root), 'utf8'));
    const parsed = recording as { stages: Record<string, unknown>; models: Record<string, string> };
    expect(Object.keys(parsed.stages)).toEqual(['classification', 'facts', 'findings']);
    expect(parsed.models.classification).toBe('gemini-3.1-flash-lite');
    // Replayed verbatim by the fake gateway, so it must be exactly what was validated.
    expect(parsed.stages.findings).toEqual({ findings: [] });
  });

  it('reads back what it wrote, with the missing stages still missing', () => {
    const root = tempRoot();

    writeGoldenPair('offer', { kind: 'report', report: emptyAnalysisReport() }, stages, root);

    const recording = readGoldenRecording('offer', root);
    expect(recording?.fixtureId).toBe('offer');
    expect(Object.keys(recording?.stages ?? {})).toEqual(['classification', 'facts', 'findings']);
    expect(readGoldenRecording('never-recorded', root)).toBeNull();
  });

  it('records a refusal with only the stage the pipeline reached', () => {
    const root = tempRoot();
    const classification = new Map<GoldenStage, StageRecording>([
      ['classification', { model: 'gemini-3.1-flash-lite', value: { isLegalDocument: false } }],
    ]);

    writeGoldenPair(
      'grocery-bill',
      { kind: 'not_a_document', reason: 'This looks like a shop receipt.' },
      classification,
      root,
    );

    const outcome: unknown = JSON.parse(
      readFileSync(goldenReportPath('grocery-bill', root), 'utf8'),
    );
    expect(outcome).toEqual({ kind: 'not_a_document', reason: 'This looks like a shop receipt.' });

    const recording = JSON.parse(readFileSync(goldenLlmPath('grocery-bill', root), 'utf8')) as {
      stages: Record<string, unknown>;
    };
    expect(Object.keys(recording.stages)).toEqual(['classification']);
  });
});

describe('the committed recordings', () => {
  it('pairs every golden report with a recording the pipeline can replay', () => {
    // A report without its recording cannot be reproduced offline, which is how a
    // golden file rots unnoticed: the demo still works and the test oracle is gone.
    for (const id of listSampleIds()) {
      const recording = readGoldenRecording(id);
      expect(recording, `${id} has no golden/llm recording`).not.toBeNull();
      expect(recording?.stages.classification, `${id} recorded no classification`).toBeDefined();

      if (loadSample(id)?.kind !== 'report') continue;
      expect(recording?.stages.facts, `${id} recorded no facts`).toBeDefined();
      expect(recording?.stages.findings, `${id} recorded no findings`).toBeDefined();
    }
  });
});
