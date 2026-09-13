import type { NextConfig } from 'next';

/**
 * Deliberately close to empty.
 *
 * The target reader is on a cheap Android over patchy mobile data, so every byte the
 * framework can be talked out of sending is a byte that does not have to arrive. That
 * argues for fewer features here, not more: no image optimiser (the report renders
 * extracted text, never page images), no rewrites, no custom webpack step.
 *
 * `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are deliberately NOT
 * set. A build that succeeds while the type checker fails is a build that lies.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Required by the Cloud Run image. Standalone emits `.next/standalone/server.js`
   * carrying only the modules the server actually traced, which is the difference
   * between shipping a whole `node_modules` and shipping the fraction of it that runs.
   *
   * What it copies beyond that is not a contract. `data/` and `golden/` are opened at
   * request time through `process.cwd()` — see `src/server/knowledge/repository.ts`
   * and `src/server/samples/repository.ts` — so no import leads to them. Next's file
   * tracer does currently guess them into the output from the `readFileSync` calls it
   * can read statically, but that is a static-analysis heuristic, not a promise: it
   * turns on the tracer's ability to follow a path expression, and the day it cannot,
   * the build still succeeds and the deployment holds no legal rules at all.
   *
   * So the Dockerfile copies both explicitly rather than relying on the guess, and
   * `/api/health` reports their counts so that an image which ended up without them
   * says so instead of serving empty reports.
   */
  output: 'standalone',

  // The header advertises the framework and version to anyone scanning, and buys the
  // reader nothing.
  poweredByHeader: false,
};

export default nextConfig;
