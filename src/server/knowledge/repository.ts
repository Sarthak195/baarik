import 'server-only';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

import type { EnforceabilityTable } from '../../core/enforceability/types';
import type { ForumTable, LimitationTable } from '../../core/remedies/types';
import { parseKnowledgeBase } from '../../core/rubric/load';
import type { KnowledgeBase } from '../../core/rubric/types';
import {
  EnforceabilityFileSchema,
  ForumsFileSchema,
  LimitationFileSchema,
} from './schemas';

/**
 * The only module that reads `data/`.
 *
 * Everything under `data/` is validated once here, at boot, and a failure throws. A
 * malformed rule that merely never fired would be far worse than a crash: the
 * document would score low, the reader would be reassured, and nothing would indicate
 * why. Failing loudly on a bad YAML edit is the whole reason the rubric is data.
 *
 * `yaml` (eemeli's, not js-yaml) is used because it reports line and column, which is
 * what makes a validation failure actionable for someone editing a rule rather than
 * reading TypeScript.
 */
export interface Knowledge {
  readonly rubric: KnowledgeBase;
  readonly enforceability: EnforceabilityTable;
  readonly forums: ForumTable;
  readonly limitation: LimitationTable;
}

let cached: Knowledge | null = null;

/**
 * Load and validate the knowledge base.
 *
 * Memoised because the files cannot change within a process and re-parsing them on
 * every request would put YAML parsing on the hot path of an endpoint whose latency
 * is dominated by a model call it should not be adding to.
 *
 * @param root Repository root. Defaults to the process working directory, which is
 *   the container's app directory on Cloud Run.
 */
export function loadKnowledge(root: string = process.cwd()): Knowledge {
  cached ??= readKnowledge(root);
  return cached;
}

/** Discard the memoised knowledge. Used by tests; never called in production. */
export function resetKnowledge(): void {
  cached = null;
}

function readKnowledge(root: string): Knowledge {
  const dataDir = join(root, 'data');

  const rubricDir = join(dataDir, 'rubric');
  const rubricFiles = Object.fromEntries(
    readdirSync(rubricDir)
      .filter((name) => name.endsWith('.yaml') && name !== 'weights.yaml')
      .map((name) => [name, parseYaml(join(rubricDir, name))]),
  );

  const rubric = parseKnowledgeBase({
    rubricFiles,
    weights: parseYaml(join(rubricDir, 'weights.yaml')),
  });

  // The enforceability table is split across files by statute for readability; the
  // engine wants one flat list, so they are concatenated after each is validated.
  const enforceabilityDir = join(dataDir, 'enforceability');
  const enforceability = readdirSync(enforceabilityDir)
    .filter((name) => name.endsWith('.yaml'))
    .flatMap((name) => {
      const path = join(enforceabilityDir, name);
      const parsed = EnforceabilityFileSchema.safeParse(parseYaml(path));
      if (!parsed.success) throw invalid(path, parsed.error.message);
      return parsed.data.rules;
    });

  const forumsPath = join(dataDir, 'remedies', 'forums.yaml');
  const parsedForums = ForumsFileSchema.safeParse(parseYaml(forumsPath));
  if (!parsedForums.success) throw invalid(forumsPath, parsedForums.error.message);
  const forums = parsedForums.data.forums;

  const limitationPath = join(dataDir, 'remedies', 'limitation.yaml');
  const parsedLimitation = LimitationFileSchema.safeParse(parseYaml(limitationPath));
  if (!parsedLimitation.success) throw invalid(limitationPath, parsedLimitation.error.message);
  const limitation = parsedLimitation.data.rules;

  assertLimitationReferencesResolve(forums, limitation, forumsPath);

  return { rubric, enforceability, forums, limitation };
}

function parseYaml(path: string): unknown {
  try {
    return YAML.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} is not valid YAML: ${message(error)}`, { cause: error });
  }
}

/** Names the file, so someone editing YAML is told where to look rather than what type failed. */
function invalid(path: string, detail: string): Error {
  return new Error(`${path} failed validation: ${detail}`);
}

/**
 * Referential integrity between the two remedies files.
 *
 * A forum pointing at a limitation rule that does not exist would silently show the
 * reader a next step with no deadline — the one thing the limitation clock exists to
 * prevent. Cheaper to catch at boot than to notice in production.
 */
function assertLimitationReferencesResolve(
  forums: ForumTable,
  limitation: LimitationTable,
  path: string,
): void {
  const known = new Set(limitation.map((rule) => rule.id));
  for (const forum of forums) {
    if (forum.limitationRuleId !== null && !known.has(forum.limitationRuleId)) {
      throw new Error(
        `${path}: forum "${forum.id}" references limitation rule "${forum.limitationRuleId}", which is not defined in limitation.yaml`,
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
