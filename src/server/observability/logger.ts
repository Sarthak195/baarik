import 'server-only';
import pino from 'pino';
import type { DestinationStream, Level } from 'pino';

import type { DocumentType } from '../../schemas/document-type';

/**
 * The only way this server is permitted to say anything out loud.
 *
 * `no-console` is an error repository-wide, so there is no second way — and that is
 * the design. The documents people bring here carry their salary, their address and
 * their PAN. ADR 0008 promises that none of it is stored, and a log line is storage:
 * it is the one artefact that reliably outlives the incident that produced it, gets
 * shipped to a third-party aggregator, and is read by people who never saw the
 * document. A `logger.info(report)` anywhere in the request path would quietly make
 * the landing page's first sentence false.
 *
 * So the interface is not a logger. There is no `log(anything)` here, no `child()`, no
 * exported pino instance to reach for. There are two functions, each taking a fixed
 * record of scalars, and each emitting a line built field by field from that record.
 * Passing a document to this module is not discouraged; it is unexpressible, and what
 * a caller does pass alongside the allowlist is dropped rather than serialised.
 *
 * `tests/unit/server/observability/logger.test.ts` is the assertion ADR 0008 promises:
 * it logs a real report containing a distinctive clause and greps the output for it.
 */

/** Exactly the vocabulary `LOG_LEVEL` accepts, so the two cannot drift apart. */
export type LogLevel = Level;

/**
 * What an operator needs to know about a finished analysis, and nothing else.
 *
 * Every field is a scalar chosen by this codebase rather than a value derived from the
 * document: `documentType` is one of eleven constants from a closed enum (so it cannot
 * carry prose), the counts are integers, and `model` is an id from `models.ts`. There
 * is no field here into which a quote, a filename or an address could be placed even
 * by a caller trying to.
 */
export interface AnalysisCompleted {
  readonly documentType: DocumentType;
  readonly findingCount: number;
  readonly groundedCount: number;
  readonly rejectedCount: number;
  readonly durationMs: number;
  readonly model: string;
  readonly degraded: boolean;
}

/**
 * Why an analysis failed, as a label rather than as a message.
 *
 * An error's `message` is untrusted text: an ingest failure can name a file, and a
 * model error can quote the payload that provoked it. A closed set of four values
 * tells an operator which subsystem to look at, which is the entire actionable content
 * of a failure line, and it cannot carry anything else.
 */
export type FailureReason = 'ingest' | 'quota' | 'model' | 'unknown';

export interface AnalysisFailed {
  readonly reason: FailureReason;
  readonly durationMs: number;
}

export interface AnalysisLogger {
  analysisCompleted(fields: AnalysisCompleted): void;
  analysisFailed(fields: AnalysisFailed): void;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  /** Injected by the test that proves the allowlist holds. Defaults to stdout. */
  readonly destination?: DestinationStream | undefined;
}

export function createAnalysisLogger(options: LoggerOptions): AnalysisLogger {
  const logger =
    options.destination === undefined
      ? pino({ level: options.level })
      : pino({ level: options.level }, options.destination);

  return {
    analysisCompleted(fields) {
      // Written out one field at a time on purpose. A spread would carry whatever the
      // caller's object happened to hold, which is how a report ends up in a log: the
      // type would not catch it, because excess-property checking applies to literals
      // and the route passes a variable.
      logger.info(
        {
          documentType: fields.documentType,
          findingCount: fields.findingCount,
          groundedCount: fields.groundedCount,
          rejectedCount: fields.rejectedCount,
          durationMs: fields.durationMs,
          model: fields.model,
          degraded: fields.degraded,
        },
        'analysis complete',
      );
    },

    analysisFailed(fields) {
      logger.warn({ reason: fields.reason, durationMs: fields.durationMs }, 'analysis failed');
    },
  };
}
