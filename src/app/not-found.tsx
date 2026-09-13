import Link from 'next/link';
import type { JSX } from 'react';

import { PageShell } from '@/components/ui/PageShell';
import { dictionaryFor } from '@/i18n';

/**
 * Reached most often by opening a report link after the tab that made it was closed.
 *
 * Nothing is stored (ADR 0008), so a report URL is not a permanent address — it
 * resolves only while the analysis that produced it is still in memory. Saying that
 * plainly is better than a bare 404, because the reader has not mistyped anything.
 *
 * This cannot read the URL, so it answers in English.
 */
export default function NotFound(): JSX.Element {
  const dictionary = dictionaryFor('en');

  return (
    <PageShell dictionary={dictionary} language="en" current="home">
      <div className="max-w-[62ch]">
        <h1 className="text-4xl">That report is not here</h1>
        <p className="text-muted mt-5 text-[1.0625rem] leading-relaxed">
          Reports are held in the memory of one request and are never written to a database or a
          disk, so a link to one stops resolving once the analysis behind it is gone. Nothing was
          lost from a store, because there is no store.
        </p>
        <p className="mt-8">
          <Link
            href="/"
            className="bg-accent text-accent-ink inline-flex min-h-11 items-center px-6 text-base font-medium"
          >
            {dictionary.nav.home}
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
