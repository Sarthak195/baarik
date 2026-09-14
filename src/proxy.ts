import { NextResponse, type NextRequest } from 'next/server';

import { contentSecurityPolicy } from '@/lib/content-security-policy';

/**
 * The only thing in front of every request, and it exists for one reason: a nonce.
 *
 * The rest of this project's security headers are fixed strings and live in
 * `next.config.ts`, where they cost nothing and reach static assets too. The
 * Content-Security-Policy cannot live there, because its `script-src` has to name a
 * value that is different on every single response. A nonce that repeats across
 * responses is one an attacker can read off a page they are allowed to see and paste
 * into the script tag they are trying to get executed on a page they are not — which
 * leaves a policy that looks strict and stops nothing.
 *
 * The file is `proxy.ts` rather than `middleware.ts` because Next 16 renamed the
 * convention; the old name still works and warns on every build.
 */

/**
 * Sixteen bytes from the platform CSRNG, base64-encoded.
 *
 * `Math.random` would be the wrong tool and not by a small margin: its output is
 * predictable from a handful of prior values, and a predictable nonce is a forgeable
 * one. The length is the 128 bits the CSP specification asks for.
 */
function mintNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function proxy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy({
    nonce: mintNonce(),
    development: process.env.NODE_ENV === 'development',
  });

  /*
   * The nonce reaches the renderer through the *request* headers rather than being
   * invented again downstream. Next looks for a `Content-Security-Policy` on the
   * incoming request, parses the `script-src` nonce out of it, and stamps that value
   * onto every script tag it emits — so the policy going out and the attributes in the
   * HTML are the same string by construction. Minting the nonce in two places would
   * eventually produce two values, and the failure mode of that is a page that arrives
   * looking complete and never hydrates.
   */
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

/**
 * Everything except Next's own build output.
 *
 * The chunks and the stylesheet under `/_next/static` are immutable files served
 * straight from disk, and a document policy governs nothing on them. Every other path
 * is matched by exclusion rather than by name, because a matcher that enumerates
 * routes is a matcher that silently stops covering the page somebody adds next month.
 */
export const config = {
  matcher: '/((?!_next/static).*)',
};
