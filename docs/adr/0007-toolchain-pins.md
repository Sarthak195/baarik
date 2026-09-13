# ADR 0007 — Deliberate toolchain pins

**Status:** accepted · **Date:** 2026-09-14

## Context

Three dependencies in this stack have a latest version that is the wrong version. All
three would fail quietly rather than loudly, and a reviewer seeing a non-latest pin
without explanation reasonably reads it as staleness. Hence this record.

## Decisions

### TypeScript pinned to 6.0.3, not 7.0.2

`typescript-eslint@8.70.0` declares `peerDependencies: { typescript: ">=4.8.4 <6.1.0" }`.
Installing TypeScript 7 — the native port, and genuinely `latest` — puts the parser
outside its supported range and **degrades type-aware linting without failing the
build**. Every rule in `strictTypeChecked` depends on type information, so the whole
purity-boundary apparatus in ADR 0001 would quietly weaken.

6.0.3 is the newest stable release inside the supported range. Revisit when
`typescript-eslint` widens its peer range.

### `@next/eslint-plugin-next` flat config, not `eslint-config-next`

Under ESLint 10, `eslint-config-next` crashes: its transitive plugins
(`eslint-plugin-react`, `-import`, `-jsx-a11y`) cap at ESLint 9, and routing it through
`FlatCompat` throws `TypeError: Converting circular structure to JSON` before any file
is linted.

Consuming `@next/eslint-plugin-next`'s flat config directly works, removes two
dependencies (`eslint-config-next`, `@eslint/eslintrc`), and makes the rule set
explicit rather than inherited. `no-html-link-for-pages` is disabled because this
project is App Router only and the rule warns on every run when it finds no `pages/`.

The cost is losing `eslint-plugin-jsx-a11y`, which `eslint-config-next` bundled.
Accessibility is covered by semantic markup and manual review instead; adding the
plugin back is worth revisiting once it supports ESLint 10.

### `@google/genai` pinned exactly to 2.22.0, no caret

It is a major version published days before this project started, and it carries the
Interactions API surface the whole server layer is written against. A caret range
would allow a minor bump to move that surface underneath a build that cannot be
re-tested before a fixed deadline.

## Consequences

Each pin is a deliberate, reversible choice with a stated trigger for revisiting.
`npm outdated` will show all three as behind; that is expected, and this file is the
answer.
