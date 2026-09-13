import type { JSX } from 'react';

import { OnboardingNotice } from '@/components/disclaimer/OnboardingNotice';
import { Callout } from '@/components/ui/Callout';
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

  // /analyze redirects here with a reason when it cannot produce a report. Without
  // this the reader is bounced back to a blank form having been told nothing, and the
  // rate-limit message pointing at the free samples is unreachable.
  const problem = firstOf(params.refused) ?? firstOf(params.error);

  return (
    <PageShell
      dictionary={dictionary}
      language={language}
      current="home"
      currentPath={acknowledged ? '/?understood=1' : '/'}
    >
      {acknowledged ? (
        <div className="space-y-12">
          {problem === undefined ? null : (
            <Callout tone="warning">
              {problem}
            </Callout>
          )}
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

/** A query value is `string | string[] | undefined`; only the first is meaningful here. */
function firstOf(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : value[0];
}
