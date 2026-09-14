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

  /**
   * The security headers whose value never changes.
   *
   * The Content-Security-Policy is not among them and cannot be: its `script-src` carries
   * a per-response nonce, so it is built in `src/proxy.ts` instead. Everything here
   * is a fixed string, which is why it belongs at this layer — `headers()` is applied to
   * every response including the immutable files under `/_next/static`, which the
   * proxy's matcher deliberately skips.
   *
   * There is no `Strict-Transport-Security`. This deploys to Cloud Run, which terminates
   * TLS itself, and the whole `.app` top-level domain — `*.run.app` with it — is on the
   * browsers' HSTS preload list, so the guarantee is already enforced before a request
   * reaches this process. Sending the header anyway would be asserting something about
   * certificate lifetimes on a future custom domain that this code cannot see.
   */
  // Next types this as returning a promise, and there is nothing here to await, so it
  // hands back a resolved one rather than being `async` for the shape of it.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          /*
           * `/api/sample` and `/api/health` answer with JSON that quotes the knowledge
           * base. Without this a browser may disregard the declared content type and
           * sniff a response into something it will execute; with it, a JSON response
           * stays a JSON response.
           */
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          /*
           * A report URL carries an id, and `/report/<id>?answered=<token>` carries the
           * key to a stored answer about somebody's salary or medical clause — see the
           * header comment in `src/app/api/ask/route.ts`, which redirects answers this
           * way precisely to keep that text out of the URL. Outbound links on a report go
           * to indiacode.nic.in, rbi.org.in and nalsa.gov.in, and none of those has any
           * business learning which page the reader left. `same-origin` keeps the
           * referrer inside this site and sends nothing out of it.
           *
           * `no-referrer` would go further and is not used: it also makes browsers send
           * `Origin: null` on form POSTs, which would take an option away from any future
           * CSRF check in exchange for nothing, since the cross-origin leak is already
           * closed.
           */
          { key: 'Referrer-Policy', value: 'same-origin' },

          /*
           * The same refusal as the policy's `frame-ancestors 'none'`, in the form older
           * engines understand. The duplication is the point rather than an oversight:
           * this is built for readers on cheap Android handsets, where the browser is
           * often an out-of-date WebView that ignores `frame-ancestors` entirely.
           */
          { key: 'X-Frame-Options', value: 'DENY' },

          /*
           * Nothing in this product asks for a camera, a microphone, a location or a
           * wallet, and a page that never needs a capability should not be able to prompt
           * for one. The list stops at those four rather than enumerating the registry:
           * naming features this code has no relationship with would be decoration.
           */
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
