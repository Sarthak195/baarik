#!/usr/bin/env node
/**
 * Fail the build on any source file over 250 lines.
 *
 * The cap is arbitrary but the effect is not: a long file is where unrelated
 * responsibilities accumulate, and it is also where an LLM reviewer reading a sampled
 * excerpt loses the thread. Keeping every module short is the cheapest structural
 * discipline available, so it is enforced rather than suggested.
 *
 * `tests/` is deliberately exempt. A table-driven test file is long because it is
 * exhaustive, which is the point of it; splitting tests by line count rather than by
 * concern would be applying the rule without its reason.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_LINES = 250;
const ROOTS = ['src', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js']);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return EXTENSIONS.has(path.slice(path.lastIndexOf('.'))) ? [path] : [];
  });
}

const offenders = ROOTS.filter((root) => {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
})
  .flatMap(walk)
  .map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n').length }))
  .filter((file) => file.lines > MAX_LINES)
  .sort((left, right) => right.lines - left.lines);

if (offenders.length > 0) {
  console.error(`Files over ${MAX_LINES} lines:\n`);
  for (const file of offenders) {
    console.error(`  ${String(file.lines).padStart(5)}  ${relative(process.cwd(), file.path)}`);
  }
  console.error('\nSplit them by responsibility rather than raising the cap.');
  process.exit(1);
}

console.log(`All source files are within ${MAX_LINES} lines.`);
