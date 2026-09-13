import Link from 'next/link';
import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { withLanguage } from '@/i18n';
import { cn } from '@/lib/cn';
import type { OutputLanguage } from '@/schemas/document-type';

export type NavKey = 'home' | 'howItWorks' | 'legalAid';

export interface SiteHeaderProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  readonly current: NavKey;
}

const PATHS: Readonly<Record<NavKey, string>> = {
  home: '/',
  howItWorks: '/how-it-works',
  legalAid: '/legal-aid',
};

/**
 * The wordmark carries both scripts because the product is named in one and read in
 * both, and because a Devanagari wordmark on an English page is the fastest way to
 * say who this was built for.
 */
export function SiteHeader({ dictionary, language, current }: SiteHeaderProps): JSX.Element {
  const keys: readonly NavKey[] = ['home', 'howItWorks', 'legalAid'];

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <Link
          href={withLanguage('/', language)}
          className="font-serif text-xl leading-none tracking-tight"
        >
          <span lang="hi">बारीक</span>
          <span className="text-faint mx-2" aria-hidden="true">
            ·
          </span>
          <span>{dictionary.meta.appName}</span>
        </Link>

        <nav aria-label={dictionary.meta.appName} className="ml-auto">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {keys.map((key) => (
              <li key={key}>
                <Link
                  href={withLanguage(PATHS[key], language)}
                  aria-current={key === current ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center underline-offset-4 hover:underline',
                    key === current ? 'text-ink underline decoration-2' : 'text-muted',
                  )}
                >
                  {dictionary.nav[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
