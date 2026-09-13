import { describe, expect, it, vi } from 'vitest';
import type { DestinationStream } from 'pino';

import type { GroundedFinding } from '@/core/grounding/verify';
import type { AnalysisReport } from '@/core/report/types';
import {
  createAnalysisLogger,
  type AnalysisCompleted,
  type AnalysisFailed,
} from '@/server/observability/logger';

import { emptyAnalysisReport } from '../samples/empty-report';

vi.mock('server-only', () => ({}));

/**
 * The test ADR 0008 promises.
 *
 * The claim on the landing page is that no document is stored. A log line is storage —
 * it outlives the request, gets shipped to an aggregator, and is read by people who
 * never saw the document — so the claim is only true if the logger physically cannot
 * carry document content. This file builds a report containing a clause, a name, a
 * filename and an IP address, logs it the way the route does, and greps the output.
 *
 * If a field is ever added to the logger, it must survive these assertions or the
 * first sentence of the product becomes false.
 */

/** A restraint clause with a company name in it: the kind of text that must never appear. */
const CLAUSE =
  'The Employee shall not, for twenty-four (24) months after separation, join any ' +
  'competitor of Meridian Retail Private Limited anywhere in India.';
const SUMMARY = 'You cannot work for a competitor anywhere in India for two years.';
const FILENAME = 'priya-sharma-offer-letter.pdf';
const CLIENT_IP = '203.0.113.42';
const REPORT_ID = '3f1c9a52-0b47-4f7e-9a1d-6c2b8e5d4a10';

interface Capture {
  readonly destination: DestinationStream;
  readonly text: () => string;
  readonly lines: () => Record<string, unknown>[];
}

function capture(): Capture {
  const chunks: string[] = [];
  return {
    destination: {
      write(chunk: string) {
        chunks.push(chunk);
      },
    },
    text: () => chunks.join(''),
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/** An analysis of a real document, with everything in it that must not be logged. */
function reportWithContent(): AnalysisReport {
  const base = emptyAnalysisReport();
  const finding: GroundedFinding = {
    id: 'f1',
    category: 'restraint_of_trade',
    exactQuote: CLAUSE,
    clauseLabel: '7.2',
    plainSummary: SUMMARY,
    obligationOn: 'you',
    benefits: 'counterparty',
    isUnusual: true,
    location: {
      start: 4120,
      end: 4120 + CLAUSE.length,
      method: 'exact',
      similarity: 1,
      matchedText: CLAUSE,
    },
    segmentId: 's12',
    pageNumber: 3,
  };

  return {
    ...base,
    reportId: REPORT_ID,
    documentType: 'employment_offer',
    findings: [finding],
    rejected: [{ finding, reason: 'not_found' }],
    grounding: {
      ...base.grounding,
      total: 2,
      grounded: 1,
      exact: 1,
      rejected: 1,
      rejectionsByReason: { ...base.grounding.rejectionsByReason, not_found: 1 },
    },
  };
}

/** Exactly the mapping `src/app/analyze/route.ts` performs. */
function fieldsFor(report: AnalysisReport): AnalysisCompleted {
  return {
    documentType: report.documentType,
    findingCount: report.grounding.total,
    groundedCount: report.grounding.grounded,
    rejectedCount: report.grounding.rejected,
    durationMs: 13_412,
    model: 'gemini-3.8-flash',
    degraded: false,
  };
}

const PINO_OWN_KEYS = ['level', 'time', 'pid', 'hostname', 'msg'];

describe('the allowlist', () => {
  it('logs an analysis of a real document without any of its content', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'info', destination: sink.destination });
    const report = reportWithContent();

    logger.analysisCompleted(fieldsFor(report));

    const output = sink.text();
    expect(output).not.toContain(CLAUSE);
    expect(output).not.toContain('Meridian');
    expect(output).not.toContain(SUMMARY);
    expect(output).not.toContain('twenty-four');
    // The quote the reader is shown as a citation is the document's own text, and the
    // matched text is that same string read back out of the document.
    expect(output).not.toContain(report.findings[0]?.location.matchedText ?? '');
    // The report id is the URL of something somebody is reading. A log line should not
    // be a way to find one.
    expect(output).not.toContain(REPORT_ID);
    expect(output).not.toContain(report.documentHash);
  });

  it('still carries what an operator actually needs', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'info', destination: sink.destination });

    logger.analysisCompleted(fieldsFor(reportWithContent()));

    const [line] = sink.lines();
    expect(line).toMatchObject({
      documentType: 'employment_offer',
      findingCount: 2,
      groundedCount: 1,
      rejectedCount: 1,
      durationMs: 13_412,
      model: 'gemini-3.8-flash',
      degraded: false,
      msg: 'analysis complete',
    });
  });

  it('emits the allowlist and nothing else, whatever the caller passes', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'info', destination: sink.destination });

    // A variable rather than an object literal, which is the case the type system does
    // NOT catch: excess-property checking applies to literals only, so a caller that
    // built its object elsewhere could hand the logger a whole document and compile.
    const leaky = {
      ...fieldsFor(reportWithContent()),
      documentText: CLAUSE,
      filename: FILENAME,
      clientIp: CLIENT_IP,
    };
    logger.analysisCompleted(leaky);

    const [line] = sink.lines();
    expect(
      Object.keys(line ?? {})
        .filter((key) => !PINO_OWN_KEYS.includes(key))
        .sort(),
    ).toEqual([
      'degraded',
      'documentType',
      'durationMs',
      'findingCount',
      'groundedCount',
      'model',
      'rejectedCount',
    ]);
    expect(sink.text()).not.toContain(CLAUSE);
    expect(sink.text()).not.toContain(FILENAME);
    expect(sink.text()).not.toContain(CLIENT_IP);
  });

  it('reduces a failure to a label, never the error message', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'info', destination: sink.destination });

    // An ingest error names the file it could not read; a model error can quote the
    // payload that provoked it. Neither may reach a log line, so the route passes a
    // label from a closed set and the message is dropped even when handed over.
    const leaky = {
      reason: 'ingest',
      durationMs: 220,
      message: `Could not read ${FILENAME}: ${CLAUSE}`,
    } satisfies AnalysisFailed & { message: string };
    logger.analysisFailed(leaky);

    const [line] = sink.lines();
    expect(line).toMatchObject({ reason: 'ingest', durationMs: 220, msg: 'analysis failed' });
    expect(sink.text()).not.toContain(FILENAME);
    expect(sink.text()).not.toContain(CLAUSE);
  });
});

describe('LOG_LEVEL', () => {
  it('moves what is emitted', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'warn', destination: sink.destination });

    logger.analysisCompleted(fieldsFor(reportWithContent()));
    expect(sink.lines()).toHaveLength(0);

    logger.analysisFailed({ reason: 'quota', durationMs: 5 });
    expect(sink.lines()).toHaveLength(1);
  });

  it('silences everything at error, and still leaks nothing on the way', () => {
    const sink = capture();
    const logger = createAnalysisLogger({ level: 'error', destination: sink.destination });

    logger.analysisCompleted(fieldsFor(reportWithContent()));
    logger.analysisFailed({ reason: 'unknown', durationMs: 5 });

    expect(sink.text()).toBe('');
  });
});

describe('the default destination', () => {
  it('needs no destination, because production writes to stdout', () => {
    // Cloud Run collects stdout; nothing here configures a transport, a file or a
    // network sink, so there is no second place a line can end up.
    expect(() => createAnalysisLogger({ level: 'info' })).not.toThrow();
  });
});
