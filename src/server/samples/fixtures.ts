import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { toCanonicalDocument } from '../../core/document/normalise';
import type { CanonicalDocument } from '../../core/document/types';
import { LIMITS } from '../config/limits';
import { extractPlainText } from '../ingest/text';
import type { AnalysisOptions } from '../pipeline/stages';

/**
 * How a committed fixture becomes the document the pipeline sees.
 *
 * Two programs must agree on this byte for byte. `scripts/record-golden.ts` canonicalises
 * a fixture and records what the model said about it; the golden-reports test
 * re-canonicalises the same file and replays that recording, asserting the report
 * reproduces exactly. Every character offset in a committed report indexes into the
 * string this function returns, so a difference of one space between the two paths
 * would move every citation in every golden file.
 */

const FIXTURES = 'fixtures';

/**
 * The recording parameters, fixed.
 *
 * These are inputs to the model's instruction, so changing one invalidates every
 * golden file. English rather than Hindi because the explanations are what an
 * evaluator reads; the Hindi path renders from the same rubric templates, which are
 * data rather than model output.
 */
export const GOLDEN_ANALYSIS_OPTIONS: AnalysisOptions = {
  language: 'en',
  readingLevel: 'standard',
  maxFindings: LIMITS.maxFindings,
};

/** Every fixture id, sorted, so two runs visit them in the same order. */
export function fixtureIds(root: string = process.cwd()): readonly string[] {
  return readdirSync(join(root, FIXTURES))
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -'.txt'.length))
    .sort();
}

export function fixtureExists(id: string, root: string = process.cwd()): boolean {
  return existsSync(fixturePath(id, root));
}

function fixturePath(id: string, root: string): string {
  return join(root, FIXTURES, `${id}.txt`);
}

/**
 * Read a fixture and canonicalise it exactly as the upload path would.
 *
 * The hash covers the canonical text rather than the raw file, because the canonical
 * string is the one every offset indexes into and the one a cache would key on.
 * Building the document twice is the cheapest way to hash the output of a pure
 * function that takes the hash as an input.
 */
export function fixtureDocument(id: string, root: string = process.cwd()): CanonicalDocument {
  const raw = extractPlainText(readFileSync(fixturePath(id, root), 'utf8'));
  const options = { maxChars: LIMITS.maxCanonicalChars };
  const draft = toCanonicalDocument(raw, '', options);
  return toCanonicalDocument(raw, createHash('sha256').update(draft.text).digest('hex'), options);
}
