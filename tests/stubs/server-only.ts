/**
 * Test stub for the `server-only` package.
 *
 * `server-only` exists to fail a BUILD: importing it from a Client Component makes
 * the bundler error, which is how `src/server` is kept out of the browser bundle. Its
 * published entry point throws unconditionally when required outside that context, so
 * under Vitest every server module would fail at import.
 *
 * Aliasing it to nothing preserves the guarantee where it actually operates — Next's
 * bundler still resolves the real package during `npm run build` — while letting the
 * server layer be unit-tested. The alias lives in `vitest.config.mts`.
 */
export {};
