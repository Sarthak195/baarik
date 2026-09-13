import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { listSampleIds, loadSample, resetSamples, sampleCount } from '@/server/samples/repository';

import { emptyReportJson as emptyReport } from './empty-report';

/**
 * The sample repository is the demo path, so these tests are about one property above
 * all others: a golden file that is wrong must fail loudly. An empty or half-written
 * report rendered as a clean contract is the worst output this product can produce,
 * and it is exactly what "just parse the JSON" would give.
 */

function withSamples(files: Readonly<Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'baarik-samples-'));
  mkdirSync(join(root, 'golden', 'reports'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    writeFileSync(join(root, 'golden', 'reports', name), text, 'utf8');
  }
  return root;
}

beforeEach(() => {
  resetSamples();
});

describe('listSampleIds', () => {
  it('returns the .json basenames, sorted', () => {
    const root = withSamples({
      'rent.json': emptyReport(),
      'offer.json': emptyReport(),
      'notes.txt': 'ignored',
    });

    expect(listSampleIds(root)).toEqual(['offer', 'rent']);
    expect(sampleCount(root)).toBe(2);
  });

  it('reports an empty list rather than throwing when golden/ was never deployed', () => {
    const root = mkdtempSync(join(tmpdir(), 'baarik-empty-'));

    // `output: 'standalone'` does not copy golden/ into the image. That is a fact
    // /api/health must be able to report, not an exception that takes the page down.
    expect(listSampleIds(root)).toEqual([]);
    expect(sampleCount(root)).toBe(0);
    expect(loadSample('offer', root)).toBeNull();
  });
});

describe('loadSample', () => {
  it('returns a report outcome for a committed sample', () => {
    const root = withSamples({ 'offer.json': emptyReport() });

    const outcome = loadSample('offer', root);

    expect(outcome?.kind).toBe('report');
    if (outcome?.kind !== 'report') throw new Error('expected a report');
    expect(outcome.report.reportId).toBe('sample');
    expect(outcome.report.risk.band).toBe('low');
  });

  it('returns the refusal for the not-a-document sample', () => {
    const root = withSamples({
      'grocery-bill.json': { kind: 'not_a_document', reason: 'This looks like a shop receipt.' },
    });

    const outcome = loadSample('grocery-bill', root);

    // A refusal is a first-class sample, not an error: it is the demo's first error case.
    expect(outcome).toEqual({ kind: 'not_a_document', reason: 'This looks like a shop receipt.' });
  });

  it('returns null for an unknown id', () => {
    const root = withSamples({ 'offer.json': emptyReport() });

    expect(loadSample('no-such-sample', root)).toBeNull();
  });

  it.each(['../../.env', '..\\..\\.env', 'offer/../../../secrets', 'Offer', 'off er'])(
    'refuses the id %j without touching the filesystem',
    (id) => {
      const root = withSamples({ 'offer.json': emptyReport() });

      // The id arrives in a query string and is joined onto a path. `join` is perfectly
      // happy to walk out of the directory, so the shape is checked before it is used.
      expect(loadSample(id, root)).toBeNull();
    },
  );

  it('throws with the path when the file is not JSON', () => {
    const root = withSamples({ 'offer.json': '{ truncated' });

    expect(() => loadSample('offer', root)).toThrow(/offer\.json is not valid JSON/);
  });

  it('throws naming the broken field when the file is not a valid analysis', () => {
    const broken = emptyReport();
    const report = broken.report as Record<string, unknown>;
    delete report.risk;

    const root = withSamples({ 'offer.json': broken });

    // The failure mode this guards against: a report with no risk section renders as a
    // contract with nothing wrong with it.
    expect(() => loadSample('offer', root)).toThrow(/report\.risk/);
  });

  it('throws when the discriminant is missing entirely', () => {
    const root = withSamples({ 'offer.json': { reportId: 'sample' } });

    expect(() => loadSample('offer', root)).toThrow(/is not a valid analysis/);
  });

  it('memoises per path, so two roots do not share a cached sample', () => {
    const first = withSamples({ 'offer.json': emptyReport() });
    const second = withSamples({
      'offer.json': { kind: 'not_a_document', reason: 'Different root.' },
    });

    expect(loadSample('offer', first)?.kind).toBe('report');
    expect(loadSample('offer', second)?.kind).toBe('not_a_document');
  });
});

describe('the committed samples', () => {
  it('every golden report in this repository parses', () => {
    // The guard against a corrupted commit: if a golden file is edited by hand, merged
    // badly or truncated, this fails here rather than on judging day.
    for (const id of listSampleIds()) {
      const outcome = loadSample(id);
      expect(outcome, `${id} should load`).not.toBeNull();
      expect(['report', 'not_a_document']).toContain(outcome?.kind);
    }
  });

  it('carries the hero sample as a full report', () => {
    const outcome = loadSample('offer-letter-meridian');

    // The landing page's first sample link. Zero model calls, and it must be a report
    // rather than a refusal, or the demo opens on an error state.
    expect(outcome?.kind).toBe('report');
    if (outcome?.kind !== 'report') throw new Error('expected a report');
    expect(outcome.report.documentType).toBe('employment_offer');
    expect(outcome.report.findings.length).toBeGreaterThan(0);
    // Timings are zeroed when recorded: serving a sample from disk costs no model time.
    expect(Object.values(outcome.report.meta.stageTimingsMs)).toEqual(
      Object.values(outcome.report.meta.stageTimingsMs).map(() => 0),
    );
  });
});
