import { describe, expect, it, beforeEach } from 'vitest';

import type { AnalysisOutcome, AnalysisReport } from '@/core/report/types';
import {
  analysisCache,
  analysisCacheKey,
  cachedAnalysisCount,
  clearAnalysisCache,
} from '@/server/store/analysis-cache';

/**
 * The cache ADR 0008 described for a week before it existed.
 *
 * Three documents and a code comment referred to an `AnalysisCache` that was not in the
 * repository. The gap mattered beyond tidiness: one analysis is three calls against a
 * tier allowing roughly twenty per model per key per day, and about three minutes of
 * wall clock, so the same rental agreement uploaded twice cost that twice.
 *
 * These tests pin the two properties that make a cache safe rather than merely fast: it
 * must not serve one question's answer to a different question, and it must not hold a
 * stranger's contract longer than the report store would.
 */

const NOW = 1_760_000_000_000;
const MINUTE = 60 * 1000;

/** Only `reportId` is read by these tests; the rest of a report is not the subject. */
function outcome(id: string): AnalysisOutcome {
  return { kind: 'report', report: { reportId: id } as AnalysisReport };
}

const BASE = {
  documentHash: 'a'.repeat(64),
  language: 'en',
  readingLevel: 'standard',
  declaredType: undefined,
} as const;

beforeEach(clearAnalysisCache);

describe('what counts as the same analysis', () => {
  it('is the same document asked the same way', () => {
    expect(analysisCacheKey(BASE)).toBe(analysisCacheKey({ ...BASE }));
  });

  it.each([
    ['a different document', { documentHash: 'b'.repeat(64) }],
    ['a different language', { language: 'hi' as const }],
    ['a different reading level', { readingLevel: 'simple' as const }],
    ['a declared type instead of auto', { declaredType: 'rent_agreement' as const }],
  ])('is NOT %s', (_label, override) => {
    // Serving one of these from another's entry would be a cache that quietly lies:
    // the reader asked for Hindi, or told us it was a lease, and got neither.
    expect(analysisCacheKey({ ...BASE, ...override })).not.toBe(analysisCacheKey(BASE));
  });
});

describe('holding an analysis', () => {
  it('returns what was stored', () => {
    analysisCache.put('k', outcome('r1'), NOW);
    expect(analysisCache.get('k', NOW)).toStrictEqual(outcome('r1'));
  });

  it('misses on a document never seen', () => {
    expect(analysisCache.get('never', NOW)).toBeNull();
  });

  it('caches a refusal too', () => {
    // A supermarket receipt refused once should be refused instantly the next time,
    // rather than spending three model calls to reach the same answer again.
    const refusal: AnalysisOutcome = { kind: 'not_a_document', reason: 'This is a receipt.' };
    analysisCache.put('receipt', refusal, NOW);
    expect(analysisCache.get('receipt', NOW)).toStrictEqual(refusal);
  });

  it('forgets an entry older than thirty minutes', () => {
    analysisCache.put('k', outcome('r1'), NOW);
    expect(analysisCache.get('k', NOW + 30 * MINUTE - 1)).not.toBeNull();
    expect(analysisCache.get('k', NOW + 30 * MINUTE + 1)).toBeNull();
  });

  it('drops a lapsed entry rather than leaving it to accumulate', () => {
    analysisCache.put('k', outcome('r1'), NOW);
    analysisCache.get('k', NOW + 31 * MINUTE);
    expect(cachedAnalysisCount()).toBe(0);
  });
});

describe('bounding what is held', () => {
  it('evicts the least recently used, not the least recently written', () => {
    for (let i = 0; i < 50; i += 1) analysisCache.put(`k${String(i)}`, outcome(`r${String(i)}`), NOW);

    // Touch the oldest entry, then overflow by one. A document being analysed
    // repeatedly is the one that should survive.
    analysisCache.get('k0', NOW);
    analysisCache.put('k50', outcome('r50'), NOW);

    expect(analysisCache.get('k0', NOW)).not.toBeNull();
    expect(analysisCache.get('k1', NOW)).toBeNull();
    expect(cachedAnalysisCount()).toBe(50);
  });

  it('never grows past its bound', () => {
    for (let i = 0; i < 500; i += 1) analysisCache.put(`k${String(i)}`, outcome('r'), NOW);
    expect(cachedAnalysisCount()).toBe(50);
  });

  it('survives the bundle boundary that has broken this before', () => {
    // `report-store.ts` documents the bug at length: Next instantiates a module-level
    // Map more than once per process, so a cache held in a module constant never hits.
    analysisCache.put('k', outcome('r1'), NOW);
    const held = (globalThis as Record<symbol, unknown>)[Symbol.for('baarik.analysisCache')];
    expect(held).toBeInstanceOf(Map);
    expect((held as Map<string, unknown>).has('k')).toBe(true);
  });
});
