import 'server-only';

import type { ReportView, SampleSummary } from '@/lib/report-view-types';
import { buildReportView } from '../report/view';
import { SAMPLE_CATALOGUE, sampleEntry } from './catalogue';
import { fixtureDocument } from './fixtures';
import { loadSample } from './repository';

/**
 * A committed sample, rendered through exactly the path a live upload takes.
 *
 * This replaces a set of hand-built view objects. Those were faster to write and
 * quietly dishonest: they were assembled by hand, so they could show a layout the
 * pipeline could not actually produce, and they silently skipped every join the real
 * adapter performs — which is why benchmarks never appeared on a sample even after the
 * data existed. A sample now proves the product works rather than illustrating it.
 *
 * The document text comes from `fixtures/`, which is therefore shipped in the
 * container. It is 84 KB and it is the source the reports were recorded from, so the
 * quotes a reader clicks are located in the same characters the verifier saw.
 */
const cache = new Map<string, ReportView | null>();

export function sampleReportView(id: string): ReportView | null {
  // Committed data: the fixture, the recording and the rubric are all immutable for the
  // life of the process, so the second reader of a sample gets the first reader's view.
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const built = build(id);
  cache.set(id, built);
  return built;
}

function build(id: string): ReportView | null {
  const entry = sampleEntry(id);
  if (entry === null) return null;

  const outcome = loadSample(id);
  // A catalogue entry with no recorded report means the two have drifted — a sample
  // was listed but never recorded. Better to 404 than to render half a page.
  if (outcome?.kind !== 'report') return null;

  return buildReportView({
    analysis: outcome.report,
    documentText: fixtureDocument(id).text,
    title: entry.title,
    blurb: entry.blurb,
  });
}

/** The samples offered on the landing page, in catalogue order. */
export function sampleSummaries(): readonly SampleSummary[] {
  return SAMPLE_CATALOGUE.map((entry) => ({
    id: entry.id,
    title: entry.title,
    documentType: entry.documentType,
    blurb: entry.blurb,
  }));
}
