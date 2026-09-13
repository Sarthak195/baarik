import 'server-only';

import type { ReportView } from '@/lib/demo/types';

/**
 * Where a freshly analysed report lives between the POST that created it and the GET
 * that renders it.
 *
 * In memory, bounded, and lost on restart — which is not a limitation to be worked
 * around but the literal content of ADR 0008. The product tells the reader that
 * nothing is stored, and that promise is only true if there is nowhere for a document
 * to be stored. A database here would make the landing page's first sentence a lie.
 *
 * The consequence is visible and owned: a report does not survive a redeploy, a scale
 * event, or a second Cloud Run instance. The report page says so, and offers a
 * download. Keyed by a random id rather than the document hash so that two people
 * analysing the same contract cannot land on each other's report by guessing a URL.
 */
export interface StoredReport {
  readonly view: ReportView;
  readonly createdAt: number;
}

/**
 * Small enough that a burst of uploads cannot grow the heap without bound, large
 * enough that nobody loses a report they are still reading. Eviction is oldest-first.
 */
const MAX_REPORTS = 50;

/**
 * Reports older than this are dropped even if the cache is not full.
 *
 * A document sitting in memory is a document that could be read by anything sharing
 * the process. Thirty minutes is longer than anyone spends on one report and shorter
 * than a deployment's lifetime.
 */
const MAX_AGE_MS = 30 * 60 * 1000;

const reports = new Map<string, StoredReport>();

export function putReport(id: string, view: ReportView, now: number): void {
  reports.set(id, { view, createdAt: now });
  evict(now);
}

export function getReport(id: string, now: number): ReportView | null {
  const stored = reports.get(id);
  if (stored === undefined) return null;

  if (now - stored.createdAt > MAX_AGE_MS) {
    reports.delete(id);
    return null;
  }
  return stored.view;
}

export function reportCount(): number {
  return reports.size;
}

/** Discard everything. Used by tests; never called in production. */
export function clearReports(): void {
  reports.clear();
}

function evict(now: number): void {
  for (const [id, stored] of reports) {
    if (now - stored.createdAt > MAX_AGE_MS) reports.delete(id);
  }

  // Map preserves insertion order, so the oldest surviving entry is the first one.
  while (reports.size > MAX_REPORTS) {
    const oldest = reports.keys().next();
    if (oldest.done) break;
    reports.delete(oldest.value);
  }
}
