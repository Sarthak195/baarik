import type { JSX } from 'react';

import { OnboardingNotice } from '@/components/disclaimer/OnboardingNotice';
import { PageShell } from '@/components/ui/PageShell';
import { PasteForm } from '@/components/upload/PasteForm';
import { PrivacyPromise } from '@/components/upload/PrivacyPromise';
import { SampleDocuments } from '@/components/upload/SampleDocuments';
import { dictionaryFor, parseLanguage, withLanguage } from '@/i18n';
import { SAMPLES } from '@/lib/demo';
import type { SearchParams } from '@/lib/page-props';

/**
 * The landing page, and the blocking disclaimer in front of it.
 *
 * The acknowledgement is carried in the URL rather than in storage or a cookie. There
 * is no account to remember it against, nothing is persisted anywhere (ADR 0008), and
 * a query parameter has the useful property of working with scripting switched off —
 * the notice's "I understand" is an ordinary link, not a dismissal handler.
 *
 * It is shown on every visit. A legal boundary someone acknowledged in March is not a
 * boundary they are operating under in September, and the cost of showing it again is
 * one click against the cost of a reader who never saw it.
 */
export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}): Promise<JSX.Element> {
  const params = await searchParams;
  const language = parseLanguage(params.lang);
  const dictionary = dictionaryFor(language);
  const acknowledged = params.understood === '1';

  return (
    <PageShell dictionary={dictionary} language={language} current="home">
      {acknowledged ? (
        <div className="space-y-12">
          <header className="max-w-[62ch]">
            <p className="text-faint mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
              {dictionary.meta.tagline}
            </p>
            <h1 className="text-4xl sm:text-5xl">{dictionary.landing.heading}</h1>
            <p className="text-muted mt-5 text-[1.0625rem] leading-relaxed">
              {dictionary.landing.lede}
            </p>
            <div className="mt-6">
              <PrivacyPromise dictionary={dictionary} />
            </div>
          </header>

          <PasteForm dictionary={dictionary} language={language} />

          <SampleDocuments samples={SAMPLES} dictionary={dictionary} language={language} />
        </div>
      ) : (
        <OnboardingNotice
          dictionary={dictionary}
          language={language}
          continueHref={withLanguage('/?understood=1', language)}
        />
      )}
    </PageShell>
  );
}
