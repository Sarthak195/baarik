import Link from 'next/link';
import { connection } from 'next/server';
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
export default async function NotFound(): Promise<JSX.Element> {
  /*
   * This was the only route in the application still prerendered at build time, and a
   * page built before any request exists cannot carry that request's CSP nonce. The
   * browser was therefore refusing the two inline scripts in the served HTML and the
   * 404 page arrived unhydrated with a pair of policy violations in the console — a
   * mild failure on this page in particular, which is a paragraph and a link, but a
   * loud one, and noise in that console is exactly what hides a real violation later.
   *
   * `connection()` waits for a request, which is all it takes to move the render past
   * the point where a nonce exists. The cost is server-rendering a page nobody is
   * supposed to reach.
   */
  await connection();

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
