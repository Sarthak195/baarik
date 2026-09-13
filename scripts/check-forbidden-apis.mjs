#!/usr/bin/env node
/**
 * Fail the build on patterns that must never enter this repository.
 *
 * Two kinds of thing are checked. The first is stale API usage: the Interactions API
 * replaced `generateContent` as Gemini's default in June 2026, and every coding model
 * writing from memory will reach for the legacy call. Catching it in CI is cheaper
 * than catching it in review, and the check itself is evidence the move was deliberate.
 *
 * The second is the set of strings a reviewer greps for when judging whether a
 * codebase was finished or abandoned: `any`, suppression comments, and unresolved
 * markers. Leaving them out is a choice; enforcing it makes the choice verifiable.
 *
 * A leaked API key is the only entry here that could cost real money, so the key
 * patterns are checked against every tracked file rather than source alone.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** @type {{pattern: RegExp, why: string, roots: string[], secret?: boolean}[]} */
const FORBIDDEN = [
  {
    pattern: /\bgenerateContent\s*\(/,
    why: 'The Interactions API (ai.interactions.create) replaced generateContent in June 2026.',
    roots: ['src', 'scripts'],
  },
  {
    pattern: /:\s*any\b|<any>|\bas any\b/,
    why: 'Explicit `any` defeats the type checking this project relies on.',
    roots: ['src'],
  },
  {
    pattern: /@ts-ignore|@ts-nocheck|eslint-disable/,
    why: 'Suppressing a checker hides the problem rather than solving it.',
    roots: ['src', 'scripts', 'tests'],
  },
  {
    pattern: /\b(TODO|FIXME|XXX|HACK)\b/,
    why: 'Unresolved markers read as abandoned work. Finish it or open an issue.',
    roots: ['src', 'scripts', 'tests'],
  },
  {
    // Two live Google key formats. `AIza…` is the long-standing one; `AQ.…` is what
    // AI Studio issues now, and a scanner that knew only the first would have waved
    // this project's actual credentials straight into a public repository.
    pattern: /AIza[0-9A-Za-z_-]{10}|\bAQ\.[A-Za-z0-9_-]{20}/,
    why: 'That looks like a Google API key. Keys belong in Secret Manager, never in git.',
    secret: true,
    roots: ['src', 'scripts', 'tests', 'data', 'fixtures', 'docs', 'golden'],
  },
  {
    pattern: /\b(sk-or-v1-|gsk_[A-Za-z0-9]{20}|sk-proj-)/,
    why: 'That looks like an OpenRouter, Groq or OpenAI key.',
    secret: true,
    roots: ['src', 'scripts', 'tests', 'data', 'fixtures', 'docs', 'golden'],
  },
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    why: 'A private key must never be committed.',
    roots: ['src', 'scripts', 'tests', 'data', 'fixtures', 'docs'],
  },
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.json', '.yaml', '.yml', '.md', '.txt']);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return EXTENSIONS.has(path.slice(path.lastIndexOf('.'))) ? [path] : [];
  });
}

/** @param {string} root */
function exists(root) {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Strings that look like credentials but announce themselves as not being one.
 *
 * Tests need key-shaped values to exercise the pool, and documentation needs to quote
 * the shape it is warning about. Narrow on purpose: a real key is random, so it will
 * not contain any of these words, and widening this list is how a scanner goes blind.
 */
const PLACEHOLDER = /example|fake|placeholder|redacted|your[-_]?key|xxxx|not[-_]?real/i;

/** @type {string[]} */
const failures = [];

for (const rule of FORBIDDEN) {
  for (const path of rule.roots.filter(exists).flatMap(walk)) {
    // This file necessarily contains every pattern it forbids.
    if (path.endsWith('check-forbidden-apis.mjs')) continue;

    const lines = readFileSync(path, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (!rule.pattern.test(line)) continue;
      // A key-shaped string that says "example" is documentation, not a leak.
      if (rule.secret === true && PLACEHOLDER.test(line)) continue;
      {
        failures.push(
          `${relative(process.cwd(), path)}:${String(index + 1)}\n    ${line.trim().slice(0, 110)}\n    ${rule.why}`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Forbidden patterns found (${String(failures.length)}):\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}

console.log('No forbidden patterns found.');
