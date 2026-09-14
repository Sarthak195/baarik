import 'server-only';

import type { AnalysisReport } from '@/core/report/types';
import { toReportView } from '@/lib/report-view';
import type { ReportView } from '@/lib/report-view-types';
import { loadKnowledge } from '../knowledge/repository';

/**
 * The one place a report view is constructed with real rules.
 *
 * `toReportView` takes the rubric as an argument instead of loading it, because that
 * module is reachable from a client component and `loadKnowledge` reads the filesystem.
 * Supplying it has to happen on the server, and it has to happen the same way for every
 * caller: a benchmark that renders on a live analysis but not on a committed sample is
 * the exact bug this function exists to make impossible.
 */
export function buildReportView(input: {
  readonly analysis: AnalysisReport;
  readonly documentText: string;
  readonly title: string;
  readonly blurb: string;
}): ReportView {
  return toReportView({ ...input, rules: loadKnowledge().rubric.rules });
}
