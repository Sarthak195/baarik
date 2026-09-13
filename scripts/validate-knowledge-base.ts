/**
 * `npm run validate` — the gate that keeps `data/` honest.
 *
 * Every legal decision this product makes is a row in a YAML file under `data/`, which
 * is the whole maintainability claim: a lawyer can add a rule without writing
 * TypeScript. The cost of that claim is that a typo in a rule is a silent product
 * defect rather than a compile error — the rule simply never fires, the document scores
 * low, and the reader is reassured by nothing at all. So the knowledge base is parsed
 * and cross-checked in CI, before anything is deployed.
 *
 * The counts printed here are deliberately the same four numbers `/api/health` reports
 * from a running deployment. `output: 'standalone'` does not copy `data/` into the
 * image, so a container can start perfectly and hold no rules whatsoever; comparing
 * this output against a `curl` of the deployment is how that is caught in one step.
 *
 * Run it as `tsx --tsconfig tsconfig.scripts.json scripts/validate-knowledge-base.ts`:
 * the knowledge repository imports `server-only`, whose real entry point throws outside
 * a React Server Component, and that config aliases it away for Node scripts.
 */

import { loadKnowledge, type Knowledge } from '../src/server/knowledge/repository';
import type { Tier } from '../src/core/risk/types';

const TIERS: readonly Tier[] = ['asymmetry', 'threshold', 'construct', 'absence'];

function main(): void {
  let knowledge: Knowledge;
  try {
    knowledge = loadKnowledge();
  } catch (error) {
    fail(error);
    return;
  }

  report(knowledge);

  // A knowledge base that parses but is empty passes every schema and analyses nothing.
  // The likeliest cause is a working directory or a container image missing `data/`,
  // so it is worth its own failure rather than a clean exit over zero rules.
  const empty = [
    knowledge.rubric.rules.length === 0 ? 'data/rubric' : null,
    knowledge.enforceability.length === 0 ? 'data/enforceability' : null,
    knowledge.forums.length === 0 ? 'data/remedies/forums.yaml' : null,
    knowledge.limitation.length === 0 ? 'data/remedies/limitation.yaml' : null,
  ].filter((name): name is string => name !== null);

  if (empty.length > 0) {
    console.error(
      `\nEmpty after parsing: ${empty.join(', ')}.\n` +
        'The files loaded but hold no rows, so every analysis would report nothing.\n' +
        `Check that the working directory is the repository root (it is ${process.cwd()}).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nKnowledge base is valid.');
}

function report(knowledge: Knowledge): void {
  const { rubric, enforceability, forums, limitation } = knowledge;

  console.log(`Knowledge base — rubric version ${rubric.version}\n`);

  console.log('  Rubric rules by tier');
  for (const tier of TIERS) {
    const count = rubric.rules.filter((rule) => rule.tier === tier).length;
    console.log(`    ${tier.padEnd(12)} ${String(count).padStart(4)}`);
  }
  console.log(`    ${'total'.padEnd(12)} ${String(rubric.rules.length).padStart(4)}\n`);

  // Grouped by verdict rather than listed, because the shape of the table is the
  // reviewable fact: a statute table with no `likely_void` row has lost s.27 or s.28(b).
  console.log(`  Enforceability rows  ${String(enforceability.length).padStart(4)}`);
  for (const [verdict, count] of countBy(enforceability.map((rule) => rule.verdict))) {
    console.log(`    ${verdict.padEnd(34)} ${String(count).padStart(4)}`);
  }
  console.log(
    `    ${'distinct constructs covered'.padEnd(34)} ` +
      `${String(new Set(enforceability.map((rule) => rule.construct)).size).padStart(4)}\n`,
  );

  console.log(`  Forums               ${String(forums.length).padStart(4)}`);
  for (const forum of forums) {
    const window = forum.limitationRuleId ?? 'no filing window';
    console.log(`    ${forum.id.padEnd(34)} ${window}`);
  }
  console.log();

  console.log(`  Limitation rules     ${String(limitation.length).padStart(4)}`);
  for (const rule of limitation) {
    const period = `${String(rule.period.count)} ${rule.period.unit}`;
    const stages =
      rule.stages.length > 0 ? `, ${String(rule.stages.length)} staged deadline(s)` : '';
    console.log(`    ${rule.id.padEnd(34)} ${period}${stages}`);
  }

  // Referential integrity between forums and limitation rules is asserted inside the
  // repository, so reaching this line means every reference resolved.
  const routed = forums.filter((forum) => forum.limitationRuleId !== null).length;
  console.log(
    `\n  ${String(routed)} of ${String(forums.length)} forums carry a limitation rule; ` +
      'every reference resolves.',
  );
}

function countBy(values: readonly string[]): readonly (readonly [string, number])[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  // Sorted by name so two runs over the same data print identical output.
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

/**
 * A validation failure is read by whoever edited the YAML, not by whoever wrote this
 * script, so the message names the file and the cause chain rather than the stack.
 */
function fail(error: unknown): void {
  console.error('Knowledge base validation FAILED.\n');

  if (error instanceof Error) {
    let current: unknown = error;
    for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
      console.error(`  ${depth > 0 ? 'caused by: ' : ''}${current.message}`);
      current = current.cause;
    }
  } else {
    console.error(`  An unrecognised value was thrown (${typeof error}).`);
  }

  console.error(
    '\nEvery file under data/ is validated on load. Fix the file named above and run\n' +
      '  npx tsx --tsconfig tsconfig.scripts.json scripts/validate-knowledge-base.ts\n' +
      'again. The YAML parser reports line and column, so the message points at the row.',
  );
  process.exitCode = 1;
}

main();
