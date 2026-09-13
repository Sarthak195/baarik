import 'server-only';

import { env } from '../config/env';
import { createAnalysisLogger, type AnalysisLogger } from './logger';

/**
 * The one logger the request path uses, at the level the environment asked for.
 *
 * Separate from `logger.ts` for the same reason `KeyPool` is separate from the pool
 * `env.ts` builds: the factory is a plain function that a test can construct with a
 * captured destination and no environment at all, while the process-wide instance is
 * the single place a setting is read. Keeping the two apart is what lets the allowlist
 * test import the logger without importing the environment.
 *
 * `LOG_LEVEL` moves what is emitted, never what a line may contain. No level causes
 * document text, quotes or extracted facts to be logged — that is a property of the
 * interface in `logger.ts`, not of this setting, and `.env.example` says so.
 */
export const analysisLog: AnalysisLogger = createAnalysisLogger({ level: env.LOG_LEVEL });
