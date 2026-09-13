import type { Metadata, Viewport } from 'next';
import type { JSX, ReactNode } from 'react';

import './globals.css';

/**
 * The layout does almost nothing, and that is the design.
 *
 * A layout cannot read the URL, so it cannot know which language the reader asked for,
 * and everything that has to change with the language — the `lang` attribute, the skip
 * link, the header, the footer — lives in `PageShell` instead. What is left here is
 * the document shell and the metadata, both of which are the same in every language.
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

export default function RootLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
