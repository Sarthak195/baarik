import { RubricFileSchema, RubricWeightsSchema } from './schema';
import type { KnowledgeBase, RubricRule } from './types';

/**
 * Parse and validate the legal knowledge base.
 *
 * The input is already-parsed plain objects, not YAML text: reading files and
 * parsing YAML are I/O concerns that belong in the server layer, and keeping them out
 * of here is what lets the whole rubric be exercised by a unit test with no
 * filesystem. The server reads `data/**`, runs each document through a YAML parser,
 * and hands the results to this function once at boot.
 *
 * Validation failures throw. A malformed rule that merely never fired would be far
 * worse than a crash: the document would score low and nobody would know why.
 */
export function parseKnowledgeBase(input: {
  /** Keyed by file path, for error messages a maintainer can act on. */
  readonly rubricFiles: Readonly<Record<string, unknown>>;
  readonly weights: unknown;
}): KnowledgeBase {
  const config = RubricWeightsSchema.parse(input.weights);
  const rules: RubricRule[] = [];
  const seen = new Map<string, string>();

  for (const [path, contents] of Object.entries(input.rubricFiles)) {
    const parsed = RubricFileSchema.safeParse(contents);
    if (!parsed.success) {
      throw new Error(`${path} is not a valid rubric file: ${parsed.error.message}`);
    }

    for (const rule of parsed.data.rules) {
      const previous = seen.get(rule.id);
      if (previous !== undefined) {
        // Ids appear in the UI next to every finding and are the handle a maintainer
        // greps for, so a collision would make one of the two rules unfindable.
        throw new Error(`Duplicate rule id "${rule.id}" in ${path}; already defined in ${previous}`);
      }
      seen.set(rule.id, path);

      rules.push({
        id: rule.id,
        tier: parsed.data.tier,
        title: rule.title,
        appliesTo: rule.appliesTo,
        when: rule.when,
        severity: rule.severity,
        weight: rule.weight,
        explain: rule.explain,
        benchmark: rule.benchmark ?? null,
        askYourLawyer: rule.askYourLawyer,
        evidenceFrom: rule.evidenceFrom ?? null,
      });
    }
  }

  if (rules.length === 0) throw new Error('The knowledge base contains no rules.');

  return { version: config.version, rules, config };
}
