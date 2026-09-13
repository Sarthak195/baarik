import type { JSX } from 'react';

import { dictionaryFor, LANGUAGES, withLanguage, type Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';
import type { OutputLanguage } from '@/schemas/document-type';

export interface SiteFooterProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  /**
   * The path a language switch should return to, query included. Without it the
   * switch used to post to a bare `?lang=hi`, discarding everything else — which
   * re-blocked the onboarding disclaimer for anyone who chose Hindi.
   */
  readonly currentPath?: string | undefined;
}

/**
 * The two sentences in this footer are fixed by architecture decisions rather than by
 * copywriting, and neither may be softened or moved below the fold.
 *
 * The first is the Advocates Act boundary (ADR 0005): this product describes what
 * statutes provide, and an enrolled advocate is the thing it is not. The second is the
 * visible consequence of storing nothing (ADR 0008) — a refresh loses the report, so
 * the reader is told before they lose it rather than after.
 *
 * The language switcher is a plain anchor with a bare query string, which resolves
 * against whatever page the reader is on. That keeps it working on every route without
 * the footer needing to know the current path, and without any JavaScript.
 */
export function SiteFooter({ dictionary, language, currentPath = '/' }: SiteFooterProps): JSX.Element {
  return (
    <footer className="border-rule mt-16 border-t">
      <div className="text-muted mx-auto max-w-4xl space-y-4 px-4 py-8 text-sm sm:px-6">
        <p className="text-ink max-w-[68ch] font-medium">{dictionary.footer.notAdvice}</p>
        <p className="max-w-[68ch]">{dictionary.footer.notSaved}</p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1" data-print="hide">
          <span className="text-faint">{dictionary.footer.languageLabel}:</span>
          {LANGUAGES.map((code) => (
            <a
              key={code}
              // Switching language must not discard the rest of the query. It used to,
              // which re-blocked the onboarding disclaimer every time someone chose Hindi.
              href={withLanguage(currentPath, code)}
              hrefLang={code}
              lang={code}
              aria-current={code === language ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center underline-offset-4 hover:underline',
                code === language ? 'text-ink underline decoration-2' : 'text-accent',
              )}
            >
              {dictionaryFor(code).languageName}
            </a>
          ))}
        </p>
      </div>
    </footer>
  );
}
