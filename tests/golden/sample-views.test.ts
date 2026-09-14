import { describe, expect, it } from 'vitest';

import { SAMPLE_CATALOGUE } from '@/server/samples/catalogue';
import { listSampleIds } from '@/server/samples/repository';
import { sampleReportView, sampleSummaries } from '@/server/samples/view';

/**
 * The samples an evaluator clicks, assembled the way a live upload is.
 *
 * `reports.test.ts` proves the pipeline still produces the committed reports. This
 * proves the committed reports still become a page — a different failure, and the one
 * that actually shipped: the samples used to be hand-written `ReportView` objects, so
 * they rendered a layout the adapter never produced and quietly skipped the join that
 * puts a statutory citation under a clause. Benchmarks worked on a live analysis and
 * were absent from every sample, which is to say absent from everything anyone was
 * likely to look at.
 *
 * Hand-built views could not fail this test, because they were the thing under test.
 * These go through `toReportView` with the real rubric and the real fixture text, so a
 * join that breaks breaks here.
 */

describe('sample report views', () => {
  it('renders every catalogued sample', () => {
    for (const entry of SAMPLE_CATALOGUE) {
      expect(sampleReportView(entry.id), entry.id).not.toBeNull();
    }
  });

  it('offers only samples that exist, and no refusals', () => {
    const recorded = new Set(listSampleIds());
    for (const entry of SAMPLE_CATALOGUE) {
      expect(recorded.has(entry.id), `${entry.id} has no recorded report`).toBe(true);
    }
    // The supermarket receipt records a refusal. It is a valuable fixture and a
    // pointless thing to offer someone as a worked example.
    expect(SAMPLE_CATALOGUE.map((entry) => entry.id)).not.toContain('grocery-bill');
  });

  it('carries the document each report was recorded from', () => {
    for (const entry of SAMPLE_CATALOGUE) {
      const view = sampleReportView(entry.id);
      expect(view?.documentText.length ?? 0, entry.id).toBeGreaterThan(500);
    }
  });

  /**
   * Every quote a reader can click has to index into the text shipped beside it. If
   * `fixtures/` ever drifts from `golden/reports/` — a fixture edited without
   * re-recording, say — the highlight lands on the wrong words, and that is worse than
   * no highlight at all because it looks authoritative.
   */
  it('locates every clause quote in that document', () => {
    for (const entry of SAMPLE_CATALOGUE) {
      const view = sampleReportView(entry.id);
      if (view === null) continue;
      for (const clause of view.clauses) {
        const { start, end } = clause.finding.location;
        expect(end, `${entry.id} ${clause.finding.id}`).toBeLessThanOrEqual(
          view.documentText.length,
        );
        expect(view.documentText.slice(start, end), `${entry.id} ${clause.finding.id}`).toBe(
          clause.finding.location.matchedText,
        );
      }
    }
  });

  /**
   * The regression this file exists for. Most rules carry no benchmark and that silence
   * is deliberate, so this asserts across the catalogue rather than per sample: if the
   * rule-to-clause join is dropped again, every one of these goes to zero at once.
   */
  it('shows the published figure a clause is measured against', () => {
    const benchmarked = SAMPLE_CATALOGUE.flatMap(
      (entry) => sampleReportView(entry.id)?.clauses ?? [],
    ).filter((clause) => clause.benchmark !== undefined);

    expect(benchmarked.length).toBeGreaterThan(0);
    for (const clause of benchmarked) {
      expect(clause.benchmark?.source.length ?? 0).toBeGreaterThan(0);
      expect(clause.driver, 'a benchmark with no driver is a join gone wrong').not.toBeNull();
    }
  });

  it('lists the catalogue on the landing page in catalogue order', () => {
    expect(sampleSummaries().map((summary) => summary.id)).toEqual(
      SAMPLE_CATALOGUE.map((entry) => entry.id),
    );
  });
});
