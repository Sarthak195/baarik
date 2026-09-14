import Link from 'next/link';
import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { withLanguage } from '@/i18n';
import type { SampleSummary } from '@/lib/report-view-types';
import type { OutputLanguage } from '@/schemas/document-type';

export interface SampleDocumentsProps {
  readonly samples: readonly SampleSummary[];
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
}

/**
 * One-click sample documents, as ordinary links.
 *
 * Every one is synthetic, written from scratch, with fictional parties, and the label
 * says so — a legal tool that quietly demonstrated on somebody's real offer letter
 * would be making a different kind of mistake than a bug.
 *
 * They are links rather than form submissions so that an evaluator with a keyboard, a
 * screen reader or no JavaScript reaches a full report in one keystroke, and so that
 * the URL they land on is the one they can share.
 */
export function SampleDocuments({
  samples,
  dictionary,
  language,
}: SampleDocumentsProps): JSX.Element {
  return (
    <section aria-labelledby="samples-heading">
      <h2 id="samples-heading" className="text-xl">
        {dictionary.landing.samplesHeading}
      </h2>
      <p className="text-muted mt-1 max-w-[68ch] text-sm">{dictionary.landing.samplesHint}</p>

      <ul className="mt-4 space-y-3">
        {samples.map((sample) => (
          <li key={sample.id}>
            <Link
              href={withLanguage(`/report/${sample.id}`, language)}
              className="border-rule bg-surface hover:border-rule-strong block border p-4"
            >
              <span className="text-faint block text-xs font-semibold tracking-wider uppercase">
                {dictionary.documentTypes[sample.documentType]}
              </span>
              <span className="mt-1 block font-serif text-lg">{sample.title}</span>
              <span className="text-muted mt-1 block text-sm">{sample.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
