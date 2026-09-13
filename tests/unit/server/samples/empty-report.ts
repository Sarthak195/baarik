import type { AnalysisReport } from '@/core/report/types';

/**
 * A valid analysis with nothing in it.
 *
 * The smallest value the sample schema must accept, built through the real
 * `AnalysisReport` type so that a field added to the report and forgotten in the
 * schema fails here at compile time rather than in production at read time.
 */
export function emptyAnalysisReport(): AnalysisReport {
  return {
    reportId: 'sample',
    documentHash: 'a'.repeat(64),
    documentType: 'nda',
    language: 'en',
    risk: {
      score: 0,
      band: 'low',
      drivers: [],
      topDrivers: [],
      unknowns: [],
      tierTotals: { asymmetry: 0, threshold: 0, construct: 0, absence: 0 },
      rubricVersion: '2026.09.13',
    },
    findings: [],
    rejected: [],
    grounding: {
      total: 0,
      grounded: 0,
      exact: 0,
      normalised: 0,
      fuzzy: 0,
      rejected: 0,
      rejectionsByReason: {
        quote_empty: 0,
        quote_too_short: 0,
        not_found: 0,
        below_threshold: 0,
        ambiguous: 0,
        duplicate: 0,
      },
    },
    enforceability: [],
    inconsistencies: [],
    nextSteps: [],
    meta: {
      rubricVersion: '2026.09.13',
      modelsUsed: ['gemini-3.8-flash'],
      stageTimingsMs: { extract: 9137, classify: 812 },
      truncated: false,
      readAsScan: false,
      generatedAt: '2026-09-13T00:00:00.000Z',
    },
  };
}

/** The same report as plain, mutable JSON, for tests that corrupt a field on purpose. */
export function emptyReportJson(): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ kind: 'report', report: emptyAnalysisReport() })) as Record<
    string,
    unknown
  >;
}
