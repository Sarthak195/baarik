# ADR 0001 — A pure, deterministic core, enforced by lint

**Status:** accepted · **Date:** 2026-09-14

## Context

Baarik decides things people may act on: whether a clause is commonly held
unenforceable, how risky an agreement is, whether someone qualifies for a free
advocate, how long they have left to file. Those decisions must be reviewable and
reproducible.

The obvious structure — call Gemini, get a risk level, render it — makes none of that
possible. The output varies run to run, no part of it can be tested without a network
and an API key, and nothing can be traced to a rule anyone could check.

## Decision

`src/core` contains every decision the product makes and is **pure**: no I/O, no
framework, no SDK, no ambient clock, no randomness. Anything needing a file, a socket
or the time of day lives in `src/server` and passes its result in as a parameter.

This is enforced by `eslint.config.mjs`, not by convention:

```js
{
  files: ['src/core/**/*.ts'],
  rules: {
    'no-restricted-imports': [/* node:*, fs, react, next, @google/genai, ... */],
    'no-restricted-syntax': [
      { selector: "NewExpression[callee.name='Date'][arguments.length=0]", /* ... */ },
      { selector: "MemberExpression[object.name='Date'][property.name='now']", /* ... */ },
      { selector: "MemberExpression[object.name='Math'][property.name='random']", /* ... */ },
    ],
  },
}
```

`today: Date` is therefore a parameter everywhere it is needed — visible in the
signature of `computeLimitation`, among others.

## Consequences

**Good.** The entire decision layer is testable with no key, no network and no mocking
library; CI runs it offline. Output is byte-stable, which is what lets committed
golden reports be asserted exactly rather than approximately. And a reader can verify
the claim in one file instead of taking a paragraph of README on trust.

**Costly.** Some plumbing is more verbose: hashing happens in the server and the hash
is passed into `toCanonicalDocument`, and YAML is parsed in the server before
`parseKnowledgeBase` sees it. That verbosity is the price of the boundary and is
accepted deliberately.

**Verified.** A probe file importing `node:fs` and calling `Date.now()`,
`Math.random()` and `new Date()` produced four lint errors, one per rule.
