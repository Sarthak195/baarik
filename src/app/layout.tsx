import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { JSX, ReactNode } from 'react';

import { LANGUAGE_HEADER, parseLanguage } from '@/i18n';
import './globals.css';

/**
 * The layout does almost nothing, and that is the design.
 *
 * A layout is still handed neither params nor a query string, so the skip link, the
 * header and the footer stay in `PageShell`, where the dictionary is in scope. The one
 * thing that cannot live there is the `lang` attribute on `<html>`, because `<html>` is
 * here — and `src/proxy.ts`, which already runs in front of every request, forwards the
 * language it parsed out of `?lang=` on the request headers so this file can read it
 * back. The metadata below is the same in every language, which is its own gap
 * (`docs/ACCESSIBILITY.md` §6) and not one this solves.
 */
export const metadata: Metadata = {
  title: {
    default: 'Baarik — read the fine print before you sign it',
    template: '%s · Baarik',
  },
  description:
    'Baarik explains an Indian rent agreement, offer letter, loan sanction, NDA, freelance contract or privacy policy clause by clause, with a verified quote from your own document and the statute that applies. Legal information, not legal advice.',
  applicationName: 'Baarik',
  robots: { index: true, follow: true },
};

/**
 * `viewport-fit` and a device-width viewport with no maximum scale: pinch-zoom must
 * keep working, and text must survive 200% zoom without a horizontal scrollbar. A
 * `maximum-scale=1` here would break both, which is why it is not here.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<JSX.Element> {
  /*
   * Parsed again rather than trusted as-is. The proxy has already normalised this
   * value, but a render that somehow happens without it — a route the matcher stops
   * covering, a future rewrite, a unit render of the layout — must still produce a
   * valid language rather than `lang=""` or `lang="undefined"`, and `parseLanguage`
   * already defines what an absent or unrecognised value means everywhere else.
   */
  const language = parseLanguage((await headers()).get(LANGUAGE_HEADER) ?? undefined);

  return (
    <html lang={language}>
      <body>{children}</body>
    </html>
  );
}
