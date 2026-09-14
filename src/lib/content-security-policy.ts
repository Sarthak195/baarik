export interface PolicyRequest {
  /** One response's nonce, minted by `src/proxy.ts`. Never reused. */
  readonly nonce: string;
  /** True only under `next dev`. See the `script-src` comment for what it relaxes. */
  readonly development: boolean;
}

/**
 * The Content-Security-Policy served with every document, built per request.
 *
 * This is a function rather than a constant because one directive cannot be a constant.
 * Next injects two inline `<script>` blocks into every page — the bootstrap and the RSC
 * flight payload — so a policy that simply refused inline script would ship a page that
 * renders and then never hydrates. A nonce is the way out: the server declares one
 * unguessable value per response, Next stamps it on the scripts it wrote itself, and the
 * browser refuses every other inline script on the page. That only holds while the value
 * is fresh, which is why it arrives as an argument.
 *
 * The list below is short on purpose. Each directive either names something this site
 * genuinely loads or names an attack it refuses, and none of them is here because other
 * people's policies have it.
 */
export function contentSecurityPolicy({ nonce, development }: PolicyRequest): string {
  return [
    /*
     * Everything a page needs comes from this origin: the one compiled stylesheet, the
     * JavaScript chunks, and the router's own RSC fetches. There are no images, no web
     * fonts and no third-party scripts at all — the type stack in `globals.css` is the
     * reader's own system fonts — so naming the origin once lets `connect-src`,
     * `img-src`, `font-src` and `media-src` inherit it. A directive appears below only
     * where it has to differ from this line.
     */
    "default-src 'self'",

    /*
     * The directive that does the actual work. `'self'` covers the chunk files under
     * `/_next/static`; the nonce covers Next's two inline blocks. An injected `<script>`
     * — or an `onclick=` attribute, which a nonce can never authorise because nonces
     * apply to elements and not to attributes — has no way to run.
     *
     * `'unsafe-eval'` under `next dev` is React's requirement, not a preference: the dev
     * build reconstructs server stack traces in the browser through `eval`, and without
     * it the development overlay throws instead of reporting the error it was opened to
     * report. Neither React nor Next uses `eval` in a production build, so the relaxation
     * never reaches a deployed image.
     *
     * `'strict-dynamic'` is deliberately absent. It exists to defend origins that serve
     * files an attacker can influence, where `'self'` is a wider set than it looks; here
     * the only JavaScript ever served from this origin is the build output, because
     * nothing in this product writes a file anywhere (ADR 0008) and there is no upload
     * path to disk. So `'self'` already names exactly the trusted set, and adopting
     * `'strict-dynamic'` would buy nothing while making the page's ability to boot
     * depend on the nonce reaching every last script tag.
     */
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ''}`,

    /*
     * The one concession, and it is a real one. `ReportSummary` and `TaraazuMeter` draw
     * their bars by writing a computed percentage into a `style` attribute, and a style
     * attribute cannot carry a nonce, so the choice is `'unsafe-inline'` or every bar on
     * the report rendering at zero width. Removing it would mean emitting a nonced
     * `<style>` element per report and addressing the bars by generated class name,
     * which is a worse component for a narrow gain.
     *
     * Narrow, because of the line above this one. CSS exfiltrates data by encoding it
     * into a URL it asks the browser to fetch, and `default-src 'self'` means every such
     * URL still has to point back here. This therefore lets an attacker who has already
     * achieved HTML injection restyle the page; it does not let them send anything off
     * it.
     */
    "style-src 'self' 'unsafe-inline'",

    /*
     * Nothing here embeds a plugin document, and plugin content runs with the privileges
     * of the page that embedded it. `default-src` would have allowed one from this
     * origin, and there is no reason to leave that open.
     */
    "object-src 'none'",

    /*
     * The directive that protects the links. An injected `<base href="https://…">`
     * silently re-resolves every relative URL on the page, and unlike scripts and forms,
     * ordinary `<a href>` navigation has no CSP directive of its own to catch it — so
     * "read the statute" on a report page would quietly lead somewhere else entirely.
     */
    "base-uri 'self'",

    /*
     * The most important line here for this particular product. The textarea on the
     * landing page holds a contract somebody is about to sign, and `/analyze` and
     * `/api/ask` are plain `<form method="post">` targets precisely so that they work
     * with scripting switched off. Rewriting one `action` attribute would therefore be
     * all it took to post a reader's employment agreement to a stranger.
     */
    "form-action 'self'",

    /*
     * Baarik's entire legal position rests on the reader having seen that this is
     * information and not advice. A site that framed a report could crop that notice out
     * of view, or overlay the page and harvest the clicks. Nothing needs to embed this,
     * so nothing may.
     */
    "frame-ancestors 'none'",
  ].join('; ');
}
