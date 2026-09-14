import type { JSX } from 'react';

import type { Benchmark as PublishedBenchmark } from '@/core/rubric/types';
import type { Dictionary } from '@/i18n';
import { ExternalIcon } from '@/components/ui/Icons';

/**
 * MEASURED AGAINST — the published baseline behind the sentence above it.
 *
 * This is capability 2 of the brief made visible. The product compares a document
 * against a statute or a published market figure rather than against a second contract
 * the reader does not have, and until this row existed that claim lived only in the
 * README: a reader saw "your deposit is ten months' rent" and never saw "the Model
 * Tenancy Act uses two".
 *
 * Deliberately subordinate. It is evidence for the row it sits under, not a sixth
 * headline on a card whose five rows are fixed — hence the indent rule, the smaller
 * type and no severity colour of its own. The rule text is quoted verbatim and the
 * source is the link, so the reader checks the claim rather than trusting it.
 */
export interface BenchmarkProps {
  readonly benchmark: PublishedBenchmark;
  readonly dictionary: Dictionary;
}

export function Benchmark({ benchmark, dictionary }: BenchmarkProps): JSX.Element {
  return (
    <div className="border-rule mt-3 border-l-2 pl-3">
      <h4 className="text-faint text-xs font-semibold tracking-[0.12em] uppercase">
        {dictionary.report.benchmarkLabel}
      </h4>

      <blockquote className="text-muted mt-1 font-mono text-[0.8125rem] leading-relaxed">
        {benchmark.text}
      </blockquote>

      {/* The source is the link text, not a "read more": a screen-reader user
          listing the links on this page hears the Act and the section, which is
          what tells them whether it is worth opening. */}
      <p className="mt-1">
        <a
          href={benchmark.url}
          rel="noreferrer noopener"
          target="_blank"
          className="text-accent inline-block min-h-11 py-2.5 text-sm underline underline-offset-4"
        >
          <cite className="not-italic">{benchmark.source}</cite>
          <ExternalIcon className="ml-1.5 -mb-0.5 inline h-3.5 w-3.5" />
        </a>
      </p>
    </div>
  );
}
