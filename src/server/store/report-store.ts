import 'server-only';

import type { ReportView } from '@/lib/report-view-types';

/**
 * Where a freshly analysed report lives between the POST that created it and the GET
 * that renders it.
 *
 * In memory, bounded, and lost on restart — which is not a limitation to work around
 * but the literal content of ADR 0008. The product tells the reader that nothing is
 * stored, and that promise is only true if there is nowhere for a document to be
 * stored. A database here would make the landing page's first sentence a lie.
 *
 * The map is hung off `globalThis` rather than held in a module-level constant. Next
 * bundles route handlers and pages into separate server chunks, so a plain module
 * constant is instantiated **twice** in one process: `/analyze` wrote a report into
 * one map and `/report/[id]` read from another, and every live report 404'd while the
 * committed samples kept working. A process-global is the narrowest thing that spans
 * both bundles, and it keeps the no-persistence guarantee intact — it is still only
 * memory, still lost on restart.
 *
 * What it does not span is instances. Two Cloud Run containers do not share a heap, so
 * a report created on one is genuinely gone on the other. That is why a miss renders
 * an explained "no longer available" page rather than a bare 404: the reader is told
 * what happened and offered the samples, which need no quota.
 */
export interface StoredReport {
  readonly view: ReportView;
  readonly createdAt: number;
}

/**
 * Large enough that nobody loses a report they are still reading. Eviction is
 * oldest-first.
 *
 * Note precisely what this bounds: entries, not bytes. A stored report holds the whole
 * document text, so at `LIMITS.maxCanonicalChars` the ceiling is 50 x 400,000 characters
 * -- 19 MiB if every character is Latin-1, and 38 MiB if even one is not, because V8
 * stores a string two-byte the moment a single character falls outside that range. That
 * is not a corner case here: all seven committed fixtures contain between 2 and 12
 * em-dashes, en-dashes or rupee signs, which `normalise.ts` preserves deliberately, so
 * one of them doubles the retained size of the whole document. Against a 512 MiB
 * container the realistic ceiling is comfortable and the worst case is not free.
 */
const MAX_REPORTS = 50;

/**
 * Reports older than this are dropped even when the cache is not full.
 *
 * A document held in memory is a document something sharing the process could read.
 * Thirty minutes is longer than anyone spends on one report and far shorter than a
 * deployment's lifetime.
 */
const MAX_AGE_MS = 30 * 60 * 1000;

const STORE_KEY = Symbol.for('baarik.reportStore');

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, StoredReport>;
};

function store(): Map<string, StoredReport> {
  const container = globalThis as GlobalWithStore;
  const existing = container[STORE_KEY];
  if (existing !== undefined) return existing;

  const created = new Map<string, StoredReport>();
  container[STORE_KEY] = created;
  return created;
}

export function putReport(id: string, view: ReportView, now: number): void {
  const reports = store();
  reports.set(id, { view, createdAt: now });
  evict(reports, now);
}

export function getReport(id: string, now: number): ReportView | null {
  const reports = store();
  const stored = reports.get(id);
  if (stored === undefined) return null;

  if (now - stored.createdAt > MAX_AGE_MS) {
    reports.delete(id);
    return null;
  }
  return stored.view;
}

export function reportCount(): number {
  return store().size;
}

/** Discard everything. Used by tests; never called in production. */
export function clearReports(): void {
  store().clear();
}

function evict(reports: Map<string, StoredReport>, now: number): void {
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
