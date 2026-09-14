import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy } from '@/lib/content-security-policy';

/**
 * The policy is a string, so nothing about it fails loudly.
 *
 * A CSP that has been quietly weakened looks exactly like one that has not: the site
 * keeps working, the header keeps being sent, and the only difference is that it has
 * stopped stopping anything. The usual way that happens is somebody hits a hydration
 * error, adds `'unsafe-inline'` to `script-src` because it makes the error go away, and
 * ships a header that now permits precisely the injection it was written to refuse.
 * These assertions are here to make that a failing test rather than a discovery.
 */

const NONCE = 'r4nd0mBase64Value==';

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split('; ').map((directive) => {
      const cut = directive.indexOf(' ');
      return [directive.slice(0, cut), directive.slice(cut + 1)];
    }),
  );
}

const production = contentSecurityPolicy({ nonce: NONCE, development: false });

describe('the production policy', () => {
  it('admits Next inline scripts by nonce and by nothing else', () => {
    const scriptSrc = directives(production).get('script-src');
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  /**
   * Next finds the nonce by taking the first directive whose name starts with
   * `script-src` and falling back to `default-src` — and a nonce it cannot parse is
   * discarded silently, leaving an unhydrated page and no error anywhere. Both halves of
   * that parse are pinned here: the quoting, and the fact that no `script-src-elem` or
   * `script-src-attr` has been introduced ahead of `script-src` to shadow it.
   */
  it('states the nonce in the form Next parses', () => {
    expect(production).toMatch(/(^|; )script-src [^;]*'nonce-[A-Za-z0-9+/_-]+={0,2}'/);
    expect(production.indexOf('script-src ')).toBeLessThan(
      production.includes('script-src-') ? production.indexOf('script-src-') : Infinity,
    );
  });

  it('refuses framing, foreign form targets and a rewritten base URL', () => {
    const parsed = directives(production);
    expect(parsed.get('frame-ancestors')).toBe("'none'");
    expect(parsed.get('form-action')).toBe("'self'");
    expect(parsed.get('base-uri')).toBe("'self'");
    expect(parsed.get('object-src')).toBe("'none'");
  });

  /**
   * `style-src` carries `'unsafe-inline'` because the report's bars set their width in a
   * `style` attribute, which cannot be nonced. What keeps that narrow is `default-src`
   * staying at `'self'`: injected CSS can restyle the page but cannot name an off-site
   * URL to send anything to. If `default-src` ever widens, this concession stops being
   * cheap, so the two are asserted together.
   */
  it('confines the inline-style concession to this origin', () => {
    const parsed = directives(production);
    expect(parsed.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(parsed.get('default-src')).toBe("'self'");
  });

  it('mints a different policy for every nonce', () => {
    expect(contentSecurityPolicy({ nonce: 'a', development: false })).not.toBe(
      contentSecurityPolicy({ nonce: 'b', development: false }),
    );
  });
});

/**
 * React evaluates code to rebuild server stack traces under `next dev`, so the dev
 * server genuinely needs `'unsafe-eval'`. The risk is that the relaxation escapes into a
 * deployed image, which is the one thing worth pinning about it.
 */
describe('the development relaxation', () => {
  it('adds unsafe-eval under next dev and nowhere else', () => {
    const development = contentSecurityPolicy({ nonce: NONCE, development: true });
    expect(directives(development).get('script-src')).toContain("'unsafe-eval'");
    expect(production).not.toContain("'unsafe-eval'");
  });
});
