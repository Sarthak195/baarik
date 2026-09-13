import type { JSX } from 'react';

import { Callout } from '@/components/ui/Callout';
import { PageShell } from '@/components/ui/PageShell';
import type { Dictionary } from '@/i18n/types';
import { withLanguage } from '@/i18n';
import type { OutputLanguage } from '@/schemas/document-type';

export interface ExpiredReportProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
}

/**
 * What a reader sees when a live report is no longer in memory.
 *
 * Reports are held in memory only and never written anywhere, so one disappears on a
 * restart, after thirty minutes, or when a second Cloud Run instance serves the
 * request. That is the price of the promise on the landing page, and the honest thing
 * is to name it: a bare 404 would read as a broken link and invite the reader to
 * wonder what else is broken.
 *
 * The samples are offered rather than a retry, because they are precomputed and cost
 * no API quota — which matters when the daily allowance is twenty requests per model
 * per key.
 */
export function ExpiredReport({ dictionary, language }: ExpiredReportProps): JSX.Element {
  return (
    <PageShell dictionary={dictionary} language={language} current="home">
      <div className="max-w-prose space-y-6">
        <h1 className="text-3xl sm:text-4xl">{dictionary.report.expiredHeading}</h1>

        <Callout tone="neutral">{dictionary.report.expiredExplanation}</Callout>

        <p className="text-muted">{dictionary.report.expiredNotAnError}</p>

        <p>
          <a className="underline underline-offset-4" href={withLanguage('/', language)}>
            {dictionary.report.expiredAction}
          </a>
        </p>
      </div>
    </PageShell>
  );
}
