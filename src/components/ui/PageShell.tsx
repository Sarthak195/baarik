import type { JSX, ReactNode } from 'react';

import type { Dictionary } from '@/i18n';
import type { OutputLanguage } from '@/schemas/document-type';
import { SiteFooter } from './SiteFooter';
import { SiteHeader, type NavKey } from './SiteHeader';

export interface PageShellProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  readonly current: NavKey;
  readonly children: ReactNode;
  /** Forwarded to the footer so a language switch preserves the current query. */
  readonly currentPath?: string | undefined;
}

/**
 * Every page's outer frame, and the reason the skip link is reliably first.
 *
 * The skip link must be the first focusable element in the document — not merely
 * early, first — or a keyboard user tabs through the whole navigation on every page
 * before reaching the thing they came for. Putting it in the layout would be tidier,
 * but a layout is handed no query string and the link's own text has to be translated.
 * So the frame lives here, where the dictionary is in scope, and the layout does
 * nothing but open the document and name its language.
 *
 * `lang` on the wrapper below usually repeats what `<html>` now says, because the
 * proxy forwards the requested language to the root layout. It stays because *usually*
 * is not *always*: `not-found.tsx` answers in English whatever `?lang=` asked for and
 * passes `language="en"` deliberately, and this attribute is the only thing stopping
 * that page from offering English prose to a Hindi speech synthesiser. A correct
 * attribute repeated costs nothing; the same attribute missing on the one page where
 * the two disagree is a page that lies about itself.
 *
 * `sr-only` until focus, `not-sr-only` on focus: invisible to sighted readers, present
 * for keyboard ones, and never hidden with `display: none`, which would take it out of
 * the focus order and defeat the point entirely.
 */
export function PageShell({
  dictionary,
  language,
  current,
  children,
  currentPath,
}: PageShellProps): JSX.Element {
  return (
    <div lang={language} className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="focus:bg-accent focus:text-accent-ink sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:px-4 focus:text-sm focus:font-medium"
      >
        {dictionary.nav.skipToContent}
      </a>

      <SiteHeader dictionary={dictionary} language={language} current={current} />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6"
      >
        {children}
      </main>

      <SiteFooter dictionary={dictionary} language={language} currentPath={currentPath} />
    </div>
  );
}
